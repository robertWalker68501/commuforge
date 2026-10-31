export type EditorPreset = "simple" | "standard" | "full";

type EditorPresetConfig = {
  menubar: boolean | string;
  plugins: string[];
  toolbar: string;
  quickbarsSelectionToolbar: string | false;
  quickbarsInsertToolbar: string | false;
};

export const editorPresets: Record<EditorPreset, EditorPresetConfig> = {
  simple: {
    menubar: false,
    plugins: [
      "autolink",
      "link",
      "lists",
      "quickbars",
      "wordcount",
    ],
    toolbar:
      "undo redo | bold italic underline | bullist numlist | link image | removeformat",
    quickbarsSelectionToolbar: "bold italic underline | quicklink",
    quickbarsInsertToolbar: "quickimage",
  },

  standard: {
    menubar: false,
    plugins: [
      "advlist",
      "autolink",
      "charmap",
      "code",
      "fullscreen",
      "image",
      "link",
      "lists",
      "media",
      "preview",
      "quickbars",
      "searchreplace",
      "table",
      "visualblocks",
      "wordcount",
    ],
    toolbar:
      "undo redo | blocks | bold italic underline strikethrough | " +
      "alignleft aligncenter alignright | bullist numlist outdent indent | " +
      "blockquote link image media table | removeformat preview fullscreen code",
    quickbarsSelectionToolbar:
      "bold italic underline | quicklink blockquote",
    quickbarsInsertToolbar: "quickimage quicktable",
  },

  full: {
    menubar: true,
    plugins: [
      "advlist",
      "anchor",
      "autolink",
      "autosave",
      "charmap",
      "code",
      "codesample",
      "directionality",
      "emoticons",
      "fullscreen",
      "help",
      "image",
      "insertdatetime",
      "link",
      "lists",
      "media",
      "nonbreaking",
      "pagebreak",
      "preview",
      "quickbars",
      "searchreplace",
      "table",
      "visualblocks",
      "visualchars",
      "wordcount",
    ],
    toolbar:
      "undo redo | blocks fontfamily fontsize | " +
      "bold italic underline strikethrough | forecolor backcolor | " +
      "alignleft aligncenter alignright alignjustify | " +
      "bullist numlist outdent indent | " +
      "blockquote link image media table codesample charmap emoticons | " +
      "removeformat preview fullscreen code",
    quickbarsSelectionToolbar:
      "bold italic underline | quicklink blockquote",
    quickbarsInsertToolbar: "quickimage quicktable",
  },
};
