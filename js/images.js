/* images.js
   Images from the student's computer. They are kept in memory as
   filename → data URL and are only swapped into the preview.
   The code and the saved file always keep the plain filename (irves.jpg).
   Data URLs (not blob URLs) because the sandboxed preview can not load our blob URLs. */
'use strict';

// Temporarily hidden. Set to true to bring back «Зураг нэмэх», the image list,
// drag-and-drop and the image warnings. (Also uncomment #btn-image in index.html.)
var IMAGES_ENABLED = false;

var Images = {
  map: Object.create(null),   // 'irves.jpg' → 'data:image/jpeg;base64,...'

  init: function () {
    if (!IMAGES_ENABLED) {
      document.querySelector('.images').hidden = true;
      // Still stop the browser from opening a dropped file in place of the editor.
      window.addEventListener('dragover', function (e) { e.preventDefault(); });
      window.addEventListener('drop', function (e) { e.preventDefault(); });
      return;
    }
    var input = $('image-input');
    $('btn-image').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      Images.addFiles(input.files);
      input.value = '';
    });
    setupDropZone();
    Images.renderList();
  },

  addFiles: function (files) {
    if (!IMAGES_ENABLED) return;
    Array.prototype.forEach.call(files, function (file) {
      if (!isImageFile(file)) {
        App.status(t('notImage', { name: file.name }));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        Images.map[file.name] = reader.result;
        Images.renderList();
        Preview.refresh();
        App.status(t('imageAdded', { name: file.name }));
      };
      reader.readAsDataURL(file);
    });
  },

  clear: function () {
    Images.map = Object.create(null);
    Images.renderList();
  },

  // Text for the preview: loaded images replaced by their data URLs.
  substitute: function (html) {
    return mapImageRefs(html, function (ref) {
      var name = cleanRef(ref);
      return name !== null && Images.map[name] ? Images.map[name] : null;
    });
  },

  // Warnings about the images used in the code.
  check: function (html) {
    if (!IMAGES_ENABLED) return [];   // no hints about a button the student can not see
    var warnings = [];
    var seen = Object.create(null);
    mapImageRefs(html, function (ref) {
      var name = cleanRef(ref);
      if (name === null || seen[name]) return null;
      seen[name] = true;

      if (Images.map[name]) {
        if (hasBadChars(name)) warnings.push(t('warnBadName', { name: name }));
        return null;
      }
      var other = findOtherCase(name);
      if (other) warnings.push(t('warnCase', { ref: name, name: other }));
      else warnings.push(t('warnNotLoaded', { name: name }));
      if (hasBadChars(name)) warnings.push(t('warnBadName', { name: name }));
      return null;
    });
    return warnings;
  },

  renderList: function () {
    var list = $('image-list');
    var names = Object.keys(Images.map).sort();
    list.textContent = '';
    $('images-empty').hidden = names.length > 0;

    names.forEach(function (name) {
      var li = document.createElement('li');
      if (hasBadChars(name)) li.className = 'warn';

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'image-copy';
      copy.title = UI.copyHint;
      var thumb = document.createElement('img');
      thumb.src = Images.map[name];
      thumb.alt = '';
      var label = document.createElement('span');
      label.textContent = name;
      copy.append(thumb, label);
      copy.addEventListener('click', function () { copyText(name); });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'image-remove';
      remove.textContent = '✕';
      remove.title = UI.removeImage;
      remove.setAttribute('aria-label', UI.removeImage + ': ' + name);
      remove.addEventListener('click', function () {
        delete Images.map[name];
        Images.renderList();
        Preview.refresh();
      });

      li.append(copy, remove);
      list.appendChild(li);
    });
  },

  showDropZone: function () {
    if (IMAGES_ENABLED) $('drop-overlay').hidden = false;
  }
};

function isImageFile(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name);
}

// Cyrillic letters or spaces in a filename may break on the web.
function hasBadChars(name) {
  return /[\u0400-\u04FF\s]/.test(name);
}

function findOtherCase(name) {
  var lower = name.toLowerCase();
  return Object.keys(Images.map).find(function (n) { return n.toLowerCase() === lower; }) || null;
}

// 'irves.jpg' or './irves.jpg' → 'irves.jpg'.
// Returns null for things that are not relative files: https://..., data:..., /x.jpg, #id.
function cleanRef(ref) {
  ref = ref.trim();
  if (!ref || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(ref)) return null;
  ref = ref.replace(/^(\.\/)+/, '').replace(/[?#].*$/, '');
  try { ref = decodeURIComponent(ref); } catch (e) { /* keep as is */ }
  return ref || null;
}

// Calls swap(value) for each image reference in the HTML:
//   <img src>, <source src>, <video poster>, and url(...) in <style> blocks and style="".
// If swap returns a string, it replaces the value; null keeps it.
function mapImageRefs(html, swap) {
  function change(value) {
    var result = swap(value);
    return result === null ? value : result;
  }

  html = html.replace(/<(img|source|video)\b[^>]*>/gi, function (tag, tagName) {
    var attr = tagName.toLowerCase() === 'video' ? 'poster' : 'src';
    var re = new RegExp('(\\s' + attr + '\\s*=\\s*)(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
    return tag.replace(re, function (m, start, dq, sq, bare) {
      if (dq !== undefined) return start + '"' + change(dq) + '"';
      if (sq !== undefined) return start + "'" + change(sq) + "'";
      return start + change(bare);
    });
  });

  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, function (m, open, css, close) {
    return open + changeCssUrls(css, change) + close;
  });

  html = html.replace(/(\sstyle\s*=\s*)("[^"]*"|'[^']*')/gi, function (m, start, value) {
    return start + changeCssUrls(value, change);
  });

  return html;
}

function changeCssUrls(css, change) {
  return css.replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi, function (m, quote, ref) {
    return 'url(' + quote + change(ref) + quote + ')';
  });
}

function copyText(text) {
  function done() { App.status(t('copied', { name: text })); }
  function fallback() {
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    area.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

// While image files are dragged over the window, a full-screen layer catches the drop.
// (The preview iframe would swallow the drop otherwise.)
function setupDropZone() {
  var overlay = $('drop-overlay');
  function hasFiles(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
  }
  document.addEventListener('dragenter', function (e) {
    if (hasFiles(e)) overlay.hidden = false;
  });
  overlay.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  overlay.addEventListener('dragleave', function (e) {
    if (e.target === overlay) overlay.hidden = true;
  });
  overlay.addEventListener('drop', function (e) {
    e.preventDefault();
    overlay.hidden = true;
    Images.addFiles(e.dataTransfer.files);
  });
  // Never let the browser open a dropped file in place of the editor.
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    if (hasFiles(e)) e.preventDefault();
    overlay.hidden = true;
  });
}
