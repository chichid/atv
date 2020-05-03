function loadPage(url) { var req = new XMLHttpRequest(); req.open('GET', url, true); req.send(); };
atv.config = { "doesJavaScriptLoadRoot": true, "DEBUG_LEVEL": 4 };
atv.onAppEntry = function() { atv.loadURL("{{HOME_URL}}/Index.xml"); };


