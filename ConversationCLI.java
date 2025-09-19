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
    private static final String LOG_FILE = ".agent/debug.log";
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
            log("Application started");
            loadConversation();
            displayConversation();
            
            if (!Files.exists(Paths.get(INPUT_FILE))) {
                createInputFile();
            }
            
            watchInputFile();
        } catch (Exception e) {
            log("Fatal error: " + e.getMessage());
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
            
            // Wait for user to hit enter with retry loop
            Scanner scanner = new Scanner(System.in);
            String response = null;
            int attempts = 0;
            int maxAttempts = 5;
            
            while (response == null && attempts < maxAttempts) {
                if (attempts > 0) {
                    System.out.println(ANSI_GOLD + "Attempt " + (attempts + 1) + "/" + maxAttempts + ". Press Enter when ready..." + ANSI_RESET);
                }
                scanner.nextLine();
                
                // Add small delay for clipboard operations on work computers
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                
                response = readFromClipboard();
                attempts++;
                
                log("Clipboard read attempt " + attempts + ": " + 
                    (response == null ? "null" : response.length() + " chars"));
                
                if (response == null || response.trim().isEmpty()) {
                    String msg = "Clipboard appears empty or inaccessible. Make sure you've copied the response text.";
                    System.out.println(ANSI_RED + msg + ANSI_RESET);
                    log("Clipboard empty on attempt " + attempts);
                    if (attempts < maxAttempts) {
                        System.out.println(ANSI_GOLD + "Try copying the text again, then press Enter..." + ANSI_RESET);
                    }
                } else {
                    String msg = "Successfully read " + response.length() + " characters from clipboard.";
                    System.out.println(ANSI_GOLD + msg + ANSI_RESET);
                    log("Clipboard read successful: " + response.length() + " chars");
                }
            }
            
            if (response != null && !response.trim().isEmpty()) {
                Message assistantMessage = new Message("assistant", response.trim());
                conversation.add(assistantMessage);
                saveMessage(assistantMessage);
                
                displayConversation();
                Files.write(Paths.get(INPUT_FILE), "Processing completed!".getBytes());
                System.out.println(ANSI_GOLD + "Watching for changes to " + INPUT_FILE + "..." + ANSI_RESET);
            } else {
                System.out.println(ANSI_RED + "Failed to read clipboard after " + maxAttempts + " attempts. Skipping this response." + ANSI_RESET);
                Files.write(Paths.get(INPUT_FILE), "Processing completed!".getBytes());
            }
            
        } catch (Exception e) {
            log("Error processing input: " + e.getMessage());
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
            log("Attempting to read clipboard...");
            Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
            Transferable contents = clipboard.getContents(null);
            
            if (contents == null) {
                log("Clipboard contents are null");
                return null;
            }
            
            if (!contents.isDataFlavorSupported(DataFlavor.stringFlavor)) {
                log("Clipboard does not support string data flavor");
                return null;
            }
            
            String result = (String) contents.getTransferData(DataFlavor.stringFlavor);
            log("Clipboard read successful, content length: " + (result != null ? result.length() : "null"));
            return result;
            
        } catch (Exception e) {
            String errorMsg = "Error reading clipboard: " + e.getMessage();
            log(errorMsg);
            System.out.println(ANSI_RED + errorMsg + ANSI_RESET);
        }
        return null;
    }

    private static void saveMessage(Message message) throws IOException {
        String record = message.role + FIELD_SEP + message.content + RECORD_SEP;
        Files.write(Paths.get(CONVERSATION_FILE), record.getBytes(), StandardOpenOption.APPEND, StandardOpenOption.CREATE);
    }

    private static void log(String message) {
        try {
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"));
            String logEntry = "[" + timestamp + "] " + message + "\n";
            Files.write(Paths.get(LOG_FILE), logEntry.getBytes(), 
                       StandardOpenOption.APPEND, StandardOpenOption.CREATE);
        } catch (IOException e) {
            System.err.println("Failed to write to log file: " + e.getMessage());
        }
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
