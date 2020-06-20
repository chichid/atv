/* global XMLHttpRequest */
/* eslint no-unused-vars: "off" */
function playVideo (videoUrl) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://kortv.com/play', true);
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
  xhr.send(JSON.stringify({
    videoUrl: videoUrl
  }));
}
