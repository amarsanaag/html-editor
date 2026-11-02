/* editor.js
   UI text, CodeMirror setup, autosave, keyboard shortcuts and layout.
   This file loads first. preview.js, images.js and files.js use UI, t(), Store and App. */
'use strict';

// All text the students see. Edit here to change the wording.
var UI = {
  appTitle: 'Веб засварлагч',
  new: 'Шинэ',
  open: 'Нээх',
  save: 'Хадгалах',
  saveTitle: 'Хадгалах (Ctrl+S)',
  saveAs: 'Өөр нэрээр хадгалах',
  addImage: 'Зураг нэмэх',
  reset: 'Эхнээс нь эхлэх',
  code: 'Код',
  preview: 'Харагдац',
  fontSmaller: 'Үсгийг жижигрүүлэх',
  fontBigger: 'Үсгийг томруулах',
  untitled: 'Нэргүй файл',
  unsavedMark: '(хадгалаагүй)',
  cancel: 'Болих',

  confirmReplace: 'Одоогийн ажил хадгалагдаагүй байна. Үргэлжлүүлэх үү?',
  confirmTemplateLink: 'Өмнөх ажил хадгалагдаагүй байна. Түүнийг арилгаад шинэ загвар нээх үү?',
  confirmReset: 'Бүх код болон зургууд арилна. Хоосон хуудаснаас эхлэх үү?',

  saved: 'Хадгаллаа: {name}',
  savedDownload: 'Хадгаллаа: {name}. Файл «Downloads» хавтас руу орсон. Түүнийг зурагнуудынхаа хажууд зөөгөөрэй.',
  saveError: 'Хадгалж чадсангүй. Дахин оролдоно уу.',
  fileNameHint: 'Файлын нэрийг латин жижиг үсгээр, хоосон зайгүй өгвөл сайн.',
  saveDialogTitle: 'Файлын нэрийг бичнэ үү',
  saveDialogNote: 'Файл «Downloads» хавтас руу хадгалагдана.',

  opened: 'Нээлээ: {name}',
  openError: 'Файлыг нээж чадсангүй.',
  templatesTitle: 'Загвар сонгох',
  templatesError: 'Загваруудыг ачаалж чадсангүй.',
  templateOpened: 'Загвар нээлээ: {name}',
  templateNotFound: 'Ийм загвар олдсонгүй: {name}',
  resetDone: 'Бүгдийг цэвэрлэлээ. Шинээр эхэлцгээе!',

  imagesTitle: 'Зургууд:',
  imagesEmpty: 'Одоохондоо зураг алга. «Зураг нэмэх» товчийг дарна уу.',
  imageAdded: 'Зураг нэмлээ: {name}',
  notImage: 'Энэ файл зураг биш байна: {name}',
  copyHint: 'Дарвал нэр нь хуулагдана',
  copied: 'Хуулсан: {name}. Кодондоо Ctrl+V дарж буулгаарай.',
  removeImage: 'Зургийг хасах',
  dropHere: 'Зургаа энд тавина уу',

  warnNotLoaded: 'Зураг ачаалагдаагүй: {name}. "Зураг нэмэх" товчоор нэмнэ үү.',
  warnCase: 'Кодонд «{ref}» гэж бичсэн ч зургийн нэр «{name}». Веб том, жижиг үсгийг ялгадаг. Яг адилхан бичээрэй.',
  warnBadName: '«{name}» гэдэг нэрэнд кирилл үсэг эсвэл хоосон зай байна. Веб дээр ажиллахгүй байж магадгүй. Латин жижиг үсгээр нэрлэвэл сайн.'
};

// t('saved', { name: 'a.html' }) → 'Хадгаллаа: a.html'
function t(key, vars) {
  var text = UI[key] || key;
  Object.keys(vars || {}).forEach(function (k) {
    text = text.split('{' + k + '}').join(vars[k]);
  });
  return text;
}

function $(id) { return document.getElementById(id); }

// localStorage wrapper. The editor must keep working if storage is blocked.
var Store = {
  get: function (key) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  },
  set: function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
  remove: function (key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
};

var WORK_KEY = 'html-editor:work';
var FONT_KEY = 'html-editor:font-size';
var SPLIT_KEY = 'html-editor:split';

var App = {
  cm: null,
  ready: false,       // true once the first document is loaded
  templateId: null,
  cleanText: null,    // text as last saved or opened; anything else is "unsaved"
  saveTimer: null,
  statusTimer: null,

  isDirty: function () {
    return App.cm.getValue() !== App.cleanText;
  },

  setText: function (text) {
    App.cm.setValue(text);
    App.cm.clearHistory();
    Preview.refresh();
  },

  markClean: function () {
    App.cleanText = App.cm.getValue();
    App.autosave();
  },

  autosave: function () {
    clearTimeout(App.saveTimer);
    if (!App.ready) return;
    Store.set(WORK_KEY, {
      text: App.cm.getValue(),
      templateId: App.templateId,
      fileName: Files.fileName,
      clean: !App.isDirty()
    });
    App.showFileName();
  },

  showFileName: function () {
    $('file-name').textContent = (Files.fileName || UI.untitled) +
      (App.isDirty() ? ' ' + UI.unsavedMark : '');
  },

  // Short message under the editor; disappears after a while.
  status: function (message) {
    var el = $('status-msg');
    el.textContent = message;
    clearTimeout(App.statusTimer);
    App.statusTimer = setTimeout(function () { el.textContent = ''; }, 10000);
  },

  // Image warnings; replaced on every preview refresh.
  showWarnings: function (list) {
    var ul = $('warnings');
    ul.textContent = '';
    list.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    });
  }
};

function applyUiText() {
  document.title = UI.appTitle;
  document.querySelectorAll('[data-ui]').forEach(function (el) {
    el.textContent = UI[el.dataset.ui];
  });
  document.querySelectorAll('[data-ui-title]').forEach(function (el) {
    el.title = UI[el.dataset.uiTitle];
    el.setAttribute('aria-label', UI[el.dataset.uiTitle]);
  });
}

function createEditor() {
  App.cm = CodeMirror($('code'), {
    mode: 'htmlmixed',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    matchTags: { bothTags: true },
    // Off on purpose: beginners end up with duplicate closing tags otherwise.
    autoCloseTags: false,
    autoCloseBrackets: false,
    extraKeys: {
      Tab: function (cm) {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('  ');
      },
      'Shift-Tab': 'indentLess'
    }
  });

  App.cm.on('change', function () {
    Preview.schedule();
    clearTimeout(App.saveTimer);
    App.saveTimer = setTimeout(App.autosave, 500);
  });

  // Image files dropped on the code go to the image list, never into the text.
  App.cm.on('drop', function (cm, e) {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault();
      Images.addFiles(e.dataTransfer.files);
    }
  });
}

function setupFontButtons() {
  var size = Number(Store.get(FONT_KEY)) || 18;
  function apply() {
    $('code').style.fontSize = size + 'px';
    App.cm.refresh();
    Store.set(FONT_KEY, size);
  }
  $('btn-font-down').addEventListener('click', function () { size = Math.max(12, size - 2); apply(); });
  $('btn-font-up').addEventListener('click', function () { size = Math.min(40, size + 2); apply(); });
  apply();
}

// Drag the bar between code and preview to change their widths.
function setupSplitter() {
  var main = $('main');
  var bar = $('splitter');
  var percent = Number(Store.get(SPLIT_KEY)) || 50;

  function apply(p) {
    percent = Math.min(80, Math.max(20, p));
    main.style.setProperty('--editor-width', percent + '%');
  }
  function done() {
    document.body.classList.remove('resizing');
    Store.set(SPLIT_KEY, percent);
    App.cm.refresh();
  }

  bar.addEventListener('pointerdown', function (e) {
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  bar.addEventListener('pointermove', function (e) {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    var box = main.getBoundingClientRect();
    apply((e.clientX - box.left) / box.width * 100);
  });
  bar.addEventListener('pointerup', done);
  bar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { apply(percent - 5); done(); }
    if (e.key === 'ArrowRight') { apply(percent + 5); done(); }
  });
  apply(percent);
}

// Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O open.
// e.code works with the Mongolian keyboard layout too.
function setupShortcuts() {
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code !== 'KeyS' && e.code !== 'KeyO') return;
    e.preventDefault();
    if (document.querySelector('dialog[open]')) return;
    if (e.code === 'KeyS') Files.save(e.shiftKey);
    else Files.open();
  }, true);
}

document.addEventListener('DOMContentLoaded', function () {
  applyUiText();
  createEditor();
  setupFontButtons();
  setupSplitter();
  setupShortcuts();
  Preview.init();
  Images.init();
  Files.init();
  window.addEventListener('pagehide', App.autosave);
  Files.loadInitial();
});
