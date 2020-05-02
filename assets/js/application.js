// settings for atv.player - communicated in PlayVideo/videoPlayerSettings
var baseURL;
var accessToken;
var showClock, timeFormat, clockPosition, overscanAdjust;
var showEndtime;
var subtitleSize;


// metadata - communicated in PlayVideo/myMetadata
var mediaURL;
var key;
var ratingKey;
var duration, partDuration;  // milli-sec (int)
var subtitleURL;


// information for atv.player - computed internally to application.js
var lastReportedTime = -1;
var lastTranscoderPingTime = -1;
var remainingTime = 0;
var startTime = 0;  // milli-sec
var isTranscoding = false;

function loadPage(url)
{
  var req = new XMLHttpRequest();
  req.open('GET', url, true);
  req.send();
};

atv.config = { 
    "doesJavaScriptLoadRoot": true,
    "DEBUG_LEVEL": 4
};

atv.onAppEntry = function()
{
  var xmlstr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?> \
    <atv> \
    <body> \
    <dialog id=\"com.sample.error-dialog\"> \
    <title>Arwa Mzakma</title> \
    <description>Lalala</description> \
    </dialog> \
    </body> \
    </atv>";

  var doc = atv.parseXML(xmlstr);
  atv.loadXML(doc);
};

