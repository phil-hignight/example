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
            // Store the request details
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
                    signal: null // We can't serialize AbortSignal
                },
                timestamp: Date.now()
            };
            
            // Get existing requests from localStorage
            const existingRequests = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            
            // Add new request
            existingRequests.push(requestData);
            
            // Save back to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(existingRequests));
            
            console.log('🎯 Intercepted request:', urlString);
        }
        
        // Call the original fetch function
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
        
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            console.log(`📤 Replaying request ${i + 1}/${requests.length}: ${request.url}`);
            
            try {
                const response = await originalFetch(request.url, request.options);
                console.log(`✅ Request ${i + 1} completed:`, response.status, response.statusText);
            } catch (error) {
                console.log(`❌ Request ${i + 1} failed:`, error.message);
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
        console.log('🗑️ Cleared all captured requests');
    };
    
    console.log('🚀 Fetch interceptor installed! Available functions:');
    console.log('  - replay() - Replay all captured requests');
    console.log('  - viewCapturedRequests() - View all captured requests');
    console.log('  - clearCapturedRequests() - Clear the request history');
    console.log('📡 Watching for exact URL matches:');
    console.log('  - /api/v1/chats/new');
    console.log('  - /api/chat/completions'); 
    console.log('  - /api/chat/completed');
    console.log('  - /api/v1/chats/<uuid>');
    console.log('🚫 Excluding URLs containing: count, pinned, /tags, page');
})();
