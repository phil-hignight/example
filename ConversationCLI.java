import java.awt.*;
import java.awt.datatransfer.*;
import java.io.*;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ConversationCLI {
    private static final String CONVERSATION_FILE = ".agent/conversation.txt";
    private static final String INPUT_FILE = "input.md";
    private static final String ANSI_RESET = "\u001B[0m";
    private static final String ANSI_GRAY = "\u001B[90m";
    private static final String ANSI_GOLD = "\u001B[33m";
    private static final String ANSI_RED = "\u001B[31m";
    
    // Use ASCII control characters as separators (very unlikely in normal text)
    private static final String FIELD_SEP = "\u001E"; // ASCII Record Separator
    private static final String RECORD_SEP = "\u001F"; // ASCII Unit Separator
    
    private static List<Message> conversation = new ArrayList<>();
    private static long lastInputModified = 0;

    public static void main(String[] args) {
        try {
            initializeFiles();
            loadConversation();
            displayConversation();
            
            if (!Files.exists(Paths.get(INPUT_FILE))) {
                createInputFile();
            }
            
            watchInputFile();
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void initializeFiles() throws IOException {
        Path agentDir = Paths.get(".agent");
        if (!Files.exists(agentDir)) {
            Files.createDirectory(agentDir);
        }
        
        Path conversationPath = Paths.get(CONVERSATION_FILE);
        if (!Files.exists(conversationPath)) {
            Files.createFile(conversationPath);
        }
    }

    private static void createInputFile() throws IOException {
        Files.write(Paths.get(INPUT_FILE), "".getBytes());
        lastInputModified = Files.getLastModifiedTime(Paths.get(INPUT_FILE)).toMillis();
    }

    private static void loadConversation() throws IOException {
        Path conversationPath = Paths.get(CONVERSATION_FILE);
        if (Files.exists(conversationPath)) {
            String content = new String(Files.readAllBytes(conversationPath));
            if (!content.trim().isEmpty()) {
                String[] records = content.split(RECORD_SEP);
                for (String record : records) {
                    record = record.trim();
                    if (!record.isEmpty()) {
                        String[] parts = record.split(FIELD_SEP);
                        if (parts.length == 2) {
                            Message msg = new Message(parts[0], parts[1]);
                            conversation.add(msg);
                        }
                    }
                }
            }
        }
        
        // If no conversation exists, add initial greeting
        if (conversation.isEmpty()) {
            Message greeting = new Message("assistant", "Hello! How can I help you today?");
            conversation.add(greeting);
            saveMessage(greeting);
        }
    }

    private static void displayConversation() {
        clearScreen();
        System.out.println("=== Conversation ===\n");
        
        for (Message msg : conversation) {
            String prefix = msg.role.equals("user") ? ">" : "|";
            String color = msg.role.equals("user") ? ANSI_GRAY : ANSI_GOLD;
            
            String[] lines = wrapText(msg.content, 70);
            for (String line : lines) {
                System.out.println(color + prefix + " " + line + ANSI_RESET);
            }
            System.out.println();
        }
    }

    private static String[] wrapText(String text, int width) {
        List<String> lines = new ArrayList<>();
        String[] words = text.split("\\s+");
        StringBuilder currentLine = new StringBuilder();
        
        for (String word : words) {
            if (currentLine.length() + word.length() + 1 > width) {
                if (currentLine.length() > 0) {
                    lines.add(currentLine.toString());
                    currentLine = new StringBuilder();
                }
            }
            if (currentLine.length() > 0) {
                currentLine.append(" ");
            }
            currentLine.append(word);
        }
        
        if (currentLine.length() > 0) {
            lines.add(currentLine.toString());
        }
        
        return lines.toArray(new String[0]);
    }

    private static void clearScreen() {
        try {
            if (System.getProperty("os.name").contains("Windows")) {
                new ProcessBuilder("cmd", "/c", "cls").inheritIO().start().waitFor();
            } else {
                System.out.print("\033[2J\033[H");
            }
        } catch (Exception e) {
            // Fallback - just print some newlines
            for (int i = 0; i < 50; i++) {
                System.out.println();
            }
        }
    }

    private static void watchInputFile() throws IOException, InterruptedException {
        Path inputPath = Paths.get(INPUT_FILE);
        lastInputModified = Files.getLastModifiedTime(inputPath).toMillis();
        
        System.out.println(ANSI_GOLD + "Watching for changes to " + INPUT_FILE + "..." + ANSI_RESET);
        
        while (true) {
            Thread.sleep(100);
            
            if (Files.exists(inputPath)) {
                long currentModified = Files.getLastModifiedTime(inputPath).toMillis();
                if (currentModified > lastInputModified) {
                    lastInputModified = currentModified;
                    handleInputChange();
                }
            }
        }
    }

    private static void handleInputChange() throws IOException {
        try {
            String input = new String(Files.readAllBytes(Paths.get(INPUT_FILE))).trim();
            
            if (input.isEmpty() || input.equals("Loading...") || input.equals("Processing completed!")) {
                return;
            }
            
            // Add user message
            Message userMessage = new Message("user", input);
            conversation.add(userMessage);
            saveMessage(userMessage);
            
            // Update input file
            Files.write(Paths.get(INPUT_FILE), "Loading...".getBytes());
            
            // Generate and copy prompt
            String prompt = generatePrompt();
            copyToClipboard(prompt);
            
            displayConversation();
            System.out.println(ANSI_GOLD + "Prompt copied to clipboard! Paste the response and hit Enter..." + ANSI_RESET);
            
            // Wait for user to hit enter
            new Scanner(System.in).nextLine();
            
            // Read response from clipboard
            String response = readFromClipboard();
            if (response != null && !response.trim().isEmpty()) {
                Message assistantMessage = new Message("assistant", response.trim());
                conversation.add(assistantMessage);
                saveMessage(assistantMessage);
                
                displayConversation();
                Files.write(Paths.get(INPUT_FILE), "Processing completed!".getBytes());
                System.out.println(ANSI_GOLD + "Watching for changes to " + INPUT_FILE + "..." + ANSI_RESET);
            } else {
                System.out.println(ANSI_RED + "Error: Clipboard is empty. Please try again." + ANSI_RESET);
                Files.write(Paths.get(INPUT_FILE), "Processing completed!".getBytes());
            }
            
        } catch (Exception e) {
            System.out.println(ANSI_RED + "Error processing input: " + e.getMessage() + ANSI_RESET);
            Files.write(Paths.get(INPUT_FILE), "Processing completed!".getBytes());
        }
    }

    private static String generatePrompt() {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Generate the next assistant message to be appended to this conversation.\n\n");
        
        for (Message msg : conversation) {
            if (msg.role.equals("assistant")) {
                prompt.append("[ASSISTANT]\n\n");
            } else {
                prompt.append("[USER]\n\n");
            }
            prompt.append(msg.content).append("\n\n");
        }
        
        prompt.append("[ASSISTANT]\n\n[your generated message will go here]");
        
        return prompt.toString();
    }

    private static void copyToClipboard(String text) throws Exception {
        Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
        StringSelection selection = new StringSelection(text);
        clipboard.setContents(selection, null);
    }

    private static String readFromClipboard() {
        try {
            Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
            Transferable contents = clipboard.getContents(null);
            if (contents != null && contents.isDataFlavorSupported(DataFlavor.stringFlavor)) {
                return (String) contents.getTransferData(DataFlavor.stringFlavor);
            }
        } catch (Exception e) {
            System.out.println(ANSI_RED + "Error reading clipboard: " + e.getMessage() + ANSI_RESET);
        }
        return null;
    }

    private static void saveMessage(Message message) throws IOException {
        String record = message.role + FIELD_SEP + message.content + RECORD_SEP;
        Files.write(Paths.get(CONVERSATION_FILE), record.getBytes(), StandardOpenOption.APPEND, StandardOpenOption.CREATE);
    }

    private static class Message {
        String role;
        String content;

        Message(String role, String content) {
            this.role = role;
            this.content = content;
        }
    }
}
