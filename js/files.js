/* files.js
   Open, save, templates and starting over.
   Chrome and Edge: the File System Access API lets the student pick the folder
   (next to the images) and later saves overwrite the same file.
   Firefox: the student types a name and the file is downloaded. */
'use strict';

var BLANK_PAGE = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n' +
  '  <title>Миний хуудас</title>\n</head>\n<body>\n\n</body>\n</html>\n';

var Files = {
  handle: null,      // file handle (Chrome, Edge) so the next save goes to the same file
  fileName: null,
  fileTypes: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }],

  init: function () {
    $('btn-new').addEventListener('click', Files.showTemplates);
    $('btn-open').addEventListener('click', Files.open);
    $('btn-save').addEventListener('click', function () { Files.save(false); });
    $('btn-save-as').addEventListener('click', function () { Files.save(true); });
    $('btn-reset').addEventListener('click', Files.reset);

    var openInput = $('open-input');
    openInput.addEventListener('change', function () {
      if (openInput.files[0]) Files.loadFile(openInput.files[0], null);
      openInput.value = '';
    });

    // Save dialog (Firefox): warn about the name while typing, but never block.
    var dialog = $('save-dialog');
    var nameInput = $('save-name');
    nameInput.addEventListener('input', function () {
      $('save-hint').textContent = nameWarning(nameInput.value);
    });
    dialog.addEventListener('close', function () {
      if (dialog.returnValue === 'ok') Files.download(nameInput.value);
    });

    var templates = $('template-dialog');
    templates.addEventListener('close', function () {
      var value = templates.returnValue;
      if (value.indexOf('tpl:') === 0) Files.useTemplate(Files.templates[value.slice(4)], true);
    });
  },

  // ---------- Saving ----------

  save: async function (asNew) {
    if (!window.showSaveFilePicker) {
      Files.showSaveDialog();
      return;
    }
    try {
      if (!Files.handle || asNew) {
        Files.handle = await window.showSaveFilePicker({
          suggestedName: Files.fileName || 'index.html',
          types: Files.fileTypes
        });
      }
      var writer = await Files.handle.createWritable();
      await writer.write(App.cm.getValue());   // exactly the editor text, UTF-8
      await writer.close();
    } catch (e) {
      if (e.name === 'AbortError') return;     // the student pressed Cancel
      Files.handle = null;
      App.status(t('saveError'));
      return;
    }
    Files.fileName = Files.handle.name;
    App.markClean();
    App.status(t('saved', { name: Files.fileName }) + ' ' + nameWarning(Files.fileName));
  },

  showSaveDialog: function () {
    var dialog = $('save-dialog');
    var nameInput = $('save-name');
    nameInput.value = Files.fileName || 'index.html';
    $('save-hint').textContent = nameWarning(nameInput.value);
    dialog.returnValue = '';
    dialog.showModal();
    nameInput.select();
  },

  download: function (name) {
    name = name.trim();
    if (!name) return;
    if (!/\.html?$/i.test(name)) name += '.html';

    var blob = new Blob([App.cm.getValue()], { type: 'text/html' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);

    Files.fileName = name;
    App.markClean();
    App.status(t('savedDownload', { name: name }) + ' ' + nameWarning(name));
  },

  // ---------- Opening ----------

  open: async function () {
    if (!window.showOpenFilePicker) {
      $('open-input').click();
      return;
    }
    try {
      var handles = await window.showOpenFilePicker({ types: Files.fileTypes });
      var file = await handles[0].getFile();
      Files.loadFile(file, handles[0]);
    } catch (e) {
      if (e.name !== 'AbortError') App.status(t('openError'));
    }
  },

  // Asks before replacing unsaved work. Asked after the file is chosen,
  // because browsers only open the file picker right after a click.
  loadFile: function (file, handle) {
    if (App.isDirty() && !confirm(UI.confirmReplace)) return;
    file.text().then(function (text) {
      App.setText(text);
      App.templateId = null;
      Files.handle = handle;
      Files.fileName = file.name;
      App.markClean();
      App.status(t('opened', { name: file.name }));
    }, function () {
      App.status(t('openError'));
    });
  },

  // ---------- Templates ----------

  templates: {},   // id → { id, title, file } from templates/index.json

  loadTemplateList: function () {
    return fetch('templates/index.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (list) {
        Files.templates = {};
        list.forEach(function (entry) { Files.templates[entry.id] = entry; });
        return list;
      });
  },

  showTemplates: function () {
    Files.loadTemplateList().then(function (list) {
      var box = $('template-list');
      box.textContent = '';
      list.forEach(function (entry) {
        var button = document.createElement('button');
        button.value = 'tpl:' + entry.id;
        button.textContent = entry.title;
        box.appendChild(button);
      });
      var dialog = $('template-dialog');
      dialog.returnValue = '';
      dialog.showModal();
    }, function () {
      App.status(t('templatesError'));
    });
  },

  useTemplate: function (entry, ask) {
    if (ask && App.isDirty() && !confirm(UI.confirmReplace)) return Promise.resolve();
    return fetch('templates/' + entry.file)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .catch(function (err) {
        if (entry.id === 'blank') return BLANK_PAGE;   // works even without a server
        throw err;
      })
      .then(function (text) {
        App.setText(text);
        App.templateId = entry.id;
        Files.handle = null;
        Files.fileName = null;
        App.ready = true;
        App.markClean();
        if (entry.title) App.status(t('templateOpened', { name: entry.title }));
      }, function () {
        App.status(t('templatesError'));
      });
  },

  useBlank: function () {
    return Files.useTemplate({ id: 'blank', file: 'blank.html' }, false);
  },

  // ---------- First load ----------
  // ?template=amitan → that template. Otherwise the autosaved work, otherwise blank.
  loadInitial: function () {
    var wanted = new URLSearchParams(location.search).get('template');
    var saved = Store.get(WORK_KEY);
    var hasWork = saved && typeof saved.text === 'string';

    if (wanted) {
      // Drop the parameter so a page reload keeps the student's work.
      history.replaceState(null, '', location.pathname + location.hash);
      if (!hasWork || saved.clean || confirm(UI.confirmTemplateLink)) {
        Files.loadTemplateList().then(function () {
          var entry = Files.templates[wanted];
          if (entry) return Files.useTemplate(entry, false);
          App.status(t('templateNotFound', { name: wanted }));
          return hasWork ? Files.restore(saved) : Files.useBlank();
        }, function () {
          App.status(t('templatesError'));
          return hasWork ? Files.restore(saved) : Files.useBlank();
        });
        return;
      }
    }
    if (hasWork) Files.restore(saved);
    else Files.useBlank();
  },

  restore: function (saved) {
    App.setText(saved.text);
    App.templateId = saved.templateId || null;
    Files.fileName = saved.fileName || null;
    App.cleanText = saved.clean ? saved.text : null;
    App.ready = true;
    App.autosave();
  },

  // ---------- Start over (shared lab computers) ----------

  reset: function () {
    if (!confirm(UI.confirmReset)) return;
    Store.remove(WORK_KEY);
    Images.clear();
    Files.useBlank().then(function () {
      App.status(t('resetDone'));
    });
  }
};

// Non-blocking advice: Latin lowercase letters, no spaces.
function nameWarning(name) {
  return /[A-Z\sЀ-ӿ]/.test(name) ? UI.fileNameHint : '';
}
