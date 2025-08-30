(function() {
    // Store the original fetch function
    const originalFetch = window.fetch;
    
    // Storage key for localStorage
    const STORAGE_KEY = 'intercepted_requests';
    
    // URL patterns to watch for (exact matching)
    const urlPatterns = [
        /^.*\/api\/v1\/chats\/new$/,  // exactly /api/v1/chats/new
        /^.*\/api\/chat\/completions$/,  // exactly /api/chat/completions
        /^.*\/api\/chat\/completed$/,  // exactly /api/chat/completed
        /^.*\/api\/v1\/chats\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/  // exactly /api/v1/chats/<uuid>
    ];
    
    // Negative patterns - exclude URLs containing these strings
    const excludePatterns = ['count', 'pinned', '/tags', 'page'];
    
    // Track current chat ID for templating
    let currentChatId = null;
    
    // Initialize storage if it doesn't exist
    if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
    
    // Override the fetch function
    window.fetch = async function(...args) {
        const [url, options = {}] = args;
        const urlString = typeof url === 'string' ? url : url.toString();
        
        // First check if URL contains any excluded patterns
        const shouldExclude = excludePatterns.some(pattern => 
            urlString.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (shouldExclude) {
            // Don't capture if URL contains excluded patterns
            return originalFetch.apply(this, args);
        }
        
        // Check if URL matches any of the watched patterns
        const shouldCapture = urlPatterns.some(pattern => 
            pattern.test(urlString)
        );
        
        if (shouldCapture) {
            const isNewChatRequest = /^.*\/api\/v1\/chats\/new$/.test(urlString);
            
            // Call the original fetch function first
            const response = originalFetch.apply(this, args);
            
            if (isNewChatRequest) {
                // Handle /chats/new request
                response.then(async (res) => {
                    const clonedResponse = res.clone();
                    try {
                        const responseBody = await clonedResponse.json();
                        if (responseBody && responseBody.id) {
                            currentChatId = responseBody.id;
                            console.log('🆔 New chat ID captured:', currentChatId);
                        }
                    } catch (error) {
                        console.log('⚠️ Could not parse response body for chat ID');
                    }
                }).catch(() => {});
                
                // Store the /new request as-is
                const requestData = {
                    url: urlString,
                    options: {
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body || null,
                        mode: options.mode,
                        credentials: options.credentials,
                        cache: options.cache,
                        redirect: options.redirect,
                        referrer: options.referrer,
                        referrerPolicy: options.referrerPolicy,
                        integrity: options.integrity,
                        keepalive: options.keepalive,
                        signal: null
                    },
                    timestamp: Date.now(),
                    isNewChat: true
                };
                
                // Get existing requests from localStorage
                const existingRequests = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                existingRequests.push(requestData);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(existingRequests));
                
                console.log('🎯 Intercepted /new request:', urlString);
            } else {
                // Handle non-/new requests - create template
                let templatedUrl = urlString;
                let templatedBody = options.body;
                
                if (currentChatId) {
                    // Replace chat ID with placeholder in URL
                    templatedUrl = urlString.replace(new RegExp(currentChatId, 'g'), '${chat_id}');
                    
                    // Replace chat ID with placeholder in body
                    if (templatedBody && typeof templatedBody === 'string') {
                        templatedBody = templatedBody.replace(new RegExp(currentChatId, 'g'), '${chat_id}');
                    }
                }
                
                const requestData = {
                    url: templatedUrl,
                    options: {
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: templatedBody,
                        mode: options.mode,
                        credentials: options.credentials,
                        cache: options.cache,
                        redirect: options.redirect,
                        referrer: options.referrer,
                        referrerPolicy: options.referrerPolicy,
                        integrity: options.integrity,
                        keepalive: options.keepalive,
                        signal: null
                    },
                    timestamp: Date.now(),
                    isTemplate: true
                };
                
                // Get existing requests from localStorage
                const existingRequests = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                existingRequests.push(requestData);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(existingRequests));
                
                console.log('🎯 Intercepted templated request:', templatedUrl);
            }
            
            return response;
        }
        
        // Call the original fetch function for non-matching requests
        return originalFetch.apply(this, args);
    };
    
    // Global replay function
    window.replay = async function() {
        const requests = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        
        if (requests.length === 0) {
            console.log('📭 No requests to replay');
            return;
        }
        
        console.log(`🔄 Replaying ${requests.length} requests...`);
        
        let replayChatId = null;
        
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            let actualUrl = request.url;
            let actualOptions = { ...request.options };
            
            if (request.isNewChat) {
                // This is a /new request - execute and capture the new chat ID
                console.log(`📤 Replaying /new request ${i + 1}/${requests.length}: ${request.url}`);
                
                try {
                    const response = await originalFetch(request.url, request.options);
                    if (response.ok) {
                        const responseBody = await response.json();
                        if (responseBody && responseBody.id) {
                            replayChatId = responseBody.id;
                            console.log('🆔 New replay chat ID:', replayChatId);
                        }
                    }
                    console.log(`✅ Request ${i + 1} completed:`, response.status, response.statusText);
                } catch (error) {
                    console.log(`❌ Request ${i + 1} failed:`, error.message);
                }
            } else if (request.isTemplate && replayChatId) {
                // This is a templated request - replace ${chat_id} with actual chat ID
                actualUrl = request.url.replace(/\$\{chat_id\}/g, replayChatId);
                if (actualOptions.body && typeof actualOptions.body === 'string') {
                    actualOptions.body = actualOptions.body.replace(/\$\{chat_id\}/g, replayChatId);
                }
                
                console.log(`📤 Replaying templated request ${i + 1}/${requests.length}: ${actualUrl}`);
                
                try {
                    const response = await originalFetch(actualUrl, actualOptions);
                    console.log(`✅ Request ${i + 1} completed:`, response.status, response.statusText);
                } catch (error) {
                    console.log(`❌ Request ${i + 1} failed:`, error.message);
                }
            } else {
                // Regular request (shouldn't happen with current patterns, but just in case)
                console.log(`📤 Replaying request ${i + 1}/${requests.length}: ${request.url}`);
                
                try {
                    const response = await originalFetch(request.url, request.options);
                    console.log(`✅ Request ${i + 1} completed:`, response.status, response.statusText);
                } catch (error) {
                    console.log(`❌ Request ${i + 1} failed:`, error.message);
                }
            }
            
            // Small delay between requests to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('🎉 All requests replayed!');
    };
    
    // Utility function to view captured requests
    window.viewCapturedRequests = function() {
        const requests = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        console.log(`📋 Captured ${requests.length} requests:`, requests);
        return requests;
    };
    
    // Utility function to clear captured requests
    window.clearCapturedRequests = function() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        currentChatId = null;
        console.log('🗑️ Cleared all captured requests');
    };
    
    console.log('🚀 Fetch interceptor with templating installed! Available functions:');
    console.log('  - replay() - Replay all captured requests with new chat ID');
    console.log('  - viewCapturedRequests() - View all captured requests');
    console.log('  - clearCapturedRequests() - Clear the request history');
    console.log('📡 Watching for exact URL matches:');
    console.log('  - /api/v1/chats/new');
    console.log('  - /api/chat/completions'); 
    console.log('  - /api/chat/completed');
    console.log('  - /api/v1/chats/<uuid>');
    console.log('🚫 Excluding URLs containing: count, pinned, /tags, page');
    console.log('🎭 Template system: Chat IDs will be parameterized as ${chat_id}');
})();
