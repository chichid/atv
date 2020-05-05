/* global XMLHttpRequest */
/* eslint no-unused-vars: "off" */
function playVideo (videoUrl) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '{{config.BaseUrl}}/play', true);
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
  xhr.send(JSON.stringify({
    videoUrl: decodeURIComponent(videoUrl)
  }));
}
