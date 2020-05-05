/* global loadPage, XMLHttpRequest, atv */
/* eslint no-unused-vars: "off" */
function loadPage (url) { var req = new XMLHttpRequest(); req.open('GET', url, true); req.send(); };
atv.config = { doesJavaScriptLoadRoot: true, DEBUG_LEVEL: 4 };
atv.onAppEntry = function () { atv.loadURL('{{config.BaseUrl}}/assets/templates/index.xml'); };
