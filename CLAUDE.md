# Веб засварлагч: онлайн HTML засварлагч, шууд харагдацтай

## Project overview

A browser-based HTML editor with live preview for children's web lessons at the
Children's Science and Technology Palace (Хүүхдийн шинжлэх ухаан технологийн ордон),
Ulaanbaatar. Primary users are grades 4–6 (ages ~9–12) with no prior coding experience,
working on shared lab desktop computers. The first lesson that uses it is
«Миний дуртай амьтан» (STEAM-WEB-1-1), but **the editor is general-purpose**: it must not
be hard-wired to that one task, and it will be reused in later lessons.

Code on the left, live rendered page on the right. Students edit HTML, add images from
their own computer, and save the `.html` file themselves.

## Hard constraints

- **Static only.** HTML, CSS, vanilla JavaScript. No backend, no database, no server-side code.
- **No build step.** No npm, bundler, transpiler or framework. Files are served as-is.
- **Hosting:** GitHub Pages (teacher's account). Must work from any subpath, so use
  relative paths everywhere.
- **No account, no login, no tracking, no analytics, no external network calls at runtime.**
  All libraries are vendored into the repo (no CDN), so the editor works on a flaky lab
  connection once loaded.
- **Browsers:** current Chrome, Edge, Firefox on desktop. Mobile is not a target, but the
  layout must not break on a narrow window.
- **No submission feature.** Students save their own files and hand them to the teacher
  (shared folder or flash drive). Do not add upload, share or "send to teacher" features.

## Editor library

- **CodeMirror 5**, vendored under `vendor/codemirror/`. Chosen over CodeMirror 6 because
  it ships as plain UMD scripts and needs no build step.
- Modes: `htmlmixed` (with its `xml`, `css`, `javascript` dependencies).
- Enable: line numbers, syntax highlighting, matching-tag highlight (`matchtags` addon),
  line wrapping, `indentUnit: 2`.
- **Disable auto-closing of tags and brackets** (`autoCloseTags: false`,
  `autoCloseBrackets: false`). Beginners end up with duplicate closing tags otherwise.
- Font size large enough to read on a projector; provide A− / A+ buttons.

## File structure

```
/
├── index.html            editor page (markup only)
├── css/editor.css
├── js/
│   ├── editor.js         CodeMirror setup, autosave, keyboard shortcuts
│   ├── preview.js        building and refreshing the preview iframe
│   ├── images.js         local image loading and src substitution
│   └── files.js          open / save / templates
├── templates/
│   ├── index.json        list of templates: [{ "id", "title", "file" }]
│   ├── blank.html
│   └── amitan.html       «Миний дуртай амьтан» (lesson STEAM-WEB-1-1)
├── vendor/codemirror/    vendored CodeMirror 5 files + LICENSE
└── CLAUDE.md
```

Keep every JS file small and readable; a teacher should be able to understand it.

## Features

### 1. Layout
- Toolbar on top, editor left, preview right, draggable splitter between them.
- Below ~800px width, stack editor above preview.
- Status line under the editor for short messages and image warnings.

### 2. Live preview
- Preview is an `<iframe sandbox="allow-scripts">` filled via `srcdoc`.
  **Do not add `allow-same-origin`**: student code must not be able to read the editor's
  `localStorage` or touch the parent page.
- Refresh with a ~300 ms debounce after each change. Keep the preview's scroll position
  across refreshes where practical.
- If the document has no `<meta charset>`, the preview must still render Cyrillic correctly.

### 3. Local images (key feature)
Images live on the student's desktop computer, not on a server. The saved HTML references
them by **relative filename** (`<img src="irves.jpg">`), so the saved file works when it
sits in the same folder as the images, and later on GitHub Pages when the teacher uploads
the HTML and images together.

- «Зураг нэмэх» button (multi-file `<input type="file" accept="image/*">`) and drag-and-drop
  of image files onto the editor or preview.
- Read each image with `FileReader.readAsDataURL` and keep a map `filename → dataURL` in
  memory. Use data URLs, not blob URLs: a sandboxed iframe without `allow-same-origin` has
  an opaque origin and cannot load the parent's blob URLs.
- When building the preview only, replace matching relative references with the data URL:
  `img[src]`, `source[src]`, `video[poster]`, and `url(...)` inside `style` attributes and
  `<style>` blocks. Match on the filename, ignoring a leading `./`.
- **Never write data URLs into the editor text or the saved file.** The student's code
  always keeps the plain filename.
- Show the loaded images as a small list (thumbnail + filename) with a "copy filename"
  click. Do not insert anything into the code automatically: typing the filename is part of
  the lesson.
- Status warnings (Mongolian, plain words):
  - a relative image referenced in the code but not loaded:
    «Зураг ачаалагдаагүй: irves.jpg. "Зураг нэмэх" товчоор нэмнэ үү.»
  - name differs only by letter case (`Irves.jpg` vs `irves.jpg`): warn that the web
    distinguishes upper and lower case.
  - filename containing Cyrillic or spaces: warn that it may break on the web.
- Images are kept in memory only (v1). After a page reload, the warning above tells the
  student which images to add again.
- Absolute `https://` image URLs pass through untouched.

### 4. Saving (the student names the file)
- «Хадгалах» button and Ctrl+S.
- Where the File System Access API exists (Chrome, Edge): use `showSaveFilePicker` so the
  student can choose the folder where their images are (e.g. the Desktop) and type the
  name. Keep the file handle so later saves overwrite the same file without asking again.
  «Өөр нэрээр хадгалах» forces a new picker.
- Fallback (Firefox): a small dialog with a filename field, then download via
  `Blob` + `<a download>`. Show a one-line note that the file went to the Downloads folder
  and must be moved next to the images.
- The student types the name freely. Only: append `.html` if missing, and show a
  non-blocking warning for Cyrillic letters, spaces or capitals
  («Файлын нэрийг латин жижиг үсгээр, хоосон зайгүй өгвөл сайн»). Do not auto-rename or
  transliterate.
- Save the editor text exactly as written, UTF-8.

### 5. Opening and templates
- «Нээх»: open an existing `.html` file from the computer (`showOpenFilePicker` or
  `<input type="file">`) to keep working on it. If opened with a handle, later saves go
  back to the same file.
- «Шинэ»: choose a template from `templates/index.json` (fetched with relative paths).
  Confirm before replacing unsaved work.
- URL parameter `?template=amitan` loads that template on first open, so a lesson can share
  a direct link. Without a parameter, restore the autosaved work, otherwise `blank.html`.
- Adding a template for a new lesson must require only a new `.html` file in `templates/`
  and one line in `index.json`. No JS changes.
- `templates/amitan.html` follows Annex 1 of the lesson plan, but with **relative** image
  paths: `<img src="irves.jpg" width="400">`.

### 6. Autosave
- Save editor text, current template id and the last filename to `localStorage` on
  each change (debounced). Wrap all storage access in `try/catch`; the editor must work
  if storage is unavailable.
- Lab computers are shared: «Шинэ» and a clear «Эхнээс нь эхлэх» action let the next
  student start clean.

## UI language and terminology

- All UI text in **Mongolian Cyrillic**. Short, plain sentences a 10-year-old understands.
  No English UI words except code itself.
- Say **«таг»** for HTML tags (never «шошго»).
- Spell **«Веб»** (not «Вэб»). Call the browser **«веб хөтөч»**.
- Keep all UI strings in one object at the top of a single JS file so they are easy to edit.

Core strings:

| Key | Text |
|---|---|
| save | Хадгалах |
| saveAs | Өөр нэрээр хадгалах |
| open | Нээх |
| new | Шинэ |
| reset | Эхнээс нь эхлэх |
| addImage | Зураг нэмэх |
| code | Код |
| preview | Харагдац |
| confirmReplace | Одоогийн ажил хадгалагдаагүй байна. Үргэлжлүүлэх үү? |
| saved | Хадгаллаа |

## Out of scope (v1)

- Submitting files to the teacher, accounts, sharing links, publishing.
- Multi-file projects / separate CSS files / folder open.
- HTML validation or error explanations.
- Persisting images across reloads (possible later with IndexedDB).
- AI features of any kind.

## Testing checklist

Before each change is considered done, check in Chrome and Firefox:
1. `?template=amitan` loads the template; Cyrillic renders correctly in the preview.
2. Adding `irves.jpg` from disk shows it in the preview; the code still says `irves.jpg`.
3. Removing the image from memory (reload) produces the "not loaded" warning.
4. Saving produces a file whose content is byte-identical to the editor text, and which
   shows the image when opened from the same folder as `irves.jpg`.
5. Typing `<script>localStorage.clear()</script>` in the editor does not affect the
   editor's own saved work.
6. Autosave restores work after a reload; «Шинэ» asks before discarding.
7. Ctrl+S saves; auto-close of tags is off.
