/* preview.js
   Builds the page shown in the preview iframe from the editor text.
   The iframe is sandboxed without allow-same-origin, so we can not read it directly.
   A tiny helper script inside the preview reports the scroll position with postMessage. */
'use strict';

var Preview = {
  frame: null,
  timer: null,
  lastHtml: null,
  scrollX: 0,
  scrollY: 0,

  init: function () {
    Preview.frame = $('preview');
    window.addEventListener('message', function (e) {
      if (e.source !== Preview.frame.contentWindow || !e.data) return;
      var pos = e.data.htmlEditorScroll;
      if (Array.isArray(pos)) {
        Preview.scrollX = toPixels(pos[0]);
        Preview.scrollY = toPixels(pos[1]);
      }
      if (e.data.htmlEditorDrag) Images.showDropZone();
    });
  },

  // Refresh ~300 ms after the student stops typing.
  schedule: function () {
    clearTimeout(Preview.timer);
    Preview.timer = setTimeout(Preview.refresh, 300);
  },

  refresh: function () {
    clearTimeout(Preview.timer);
    var text = App.cm.getValue();
    App.showWarnings(Images.check(text));

    // Images are swapped for data URLs here only, never in the editor text.
    var html = addCharset(Images.substitute(text));
    if (html === Preview.lastHtml) return;
    Preview.lastHtml = html;
    Preview.frame.srcdoc = html + helperScript(Preview.scrollX, Preview.scrollY);
  }
};

function toPixels(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

// Make sure Cyrillic shows correctly even without <meta charset>.
function addCharset(html) {
  if (/<meta[^>]+charset/i.test(html)) return html;
  var meta = '<meta charset="utf-8">';
  var head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    var end = head.index + head[0].length;
    return html.slice(0, end) + meta + html.slice(end);
  }
  var doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return doctype[0] + meta + html.slice(doctype[0].length);
  return meta + html;
}

// Runs inside the preview: restores the scroll position, reports scrolling,
// and tells the editor when image files are dragged over the preview.
function helperScript(x, y) {
  return '<script>(function(){' +
    'var x=' + toPixels(x) + ',y=' + toPixels(y) + ';' +
    'function go(){if(x||y)scrollTo(x,y);}' +
    'go();addEventListener("DOMContentLoaded",go);addEventListener("load",go);' +
    'addEventListener("scroll",function(){parent.postMessage({htmlEditorScroll:[scrollX,scrollY]},"*");});' +
    'addEventListener("dragenter",function(e){' +
    'if(e.dataTransfer&&[].indexOf.call(e.dataTransfer.types,"Files")>=0)parent.postMessage({htmlEditorDrag:1},"*");});' +
    '})();<\/script>';
}
