import { ObsidianFlavoredMarkdown } from "@quartz-community/obsidian-flavored-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { normalizePath, parseFrontmatter } from "./model.js";

export const RENDERER_VERSION = "quartz-browser-adapter-1";

const quartzContext = {
  argv: { directory: "" },
  cfg: { configuration: {}, plugins: { transformers: [] } },
};

const quartzObsidian = ObsidianFlavoredMarkdown({
  comments: true,
  highlight: true,
  wikilinks: true,
  callouts: true,
  mermaid: true,
  parseTags: true,
  parseBlockReferences: true,
  enableInHtmlEmbed: false,
  enableYouTubeEmbed: true,
  enableTweetEmbed: true,
  enableVideoEmbed: true,
  enableCheckbox: false,
  enableObsidianUri: true,
});

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "audio",
    "iframe",
    "mark",
    "object",
    "source",
    "video",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] || []),
      "className",
      "id",
      "ariaHidden",
      "ariaLabel",
      "role",
    ],
    blockquote: [
      ...(defaultSchema.attributes?.blockquote || []),
      "dataCallout",
      "dataCalloutFold",
      "dataCalloutMetadata",
      "dataUrl",
      "dataBlock",
      "dataEmbedAlias",
    ],
    code: [
      ...(defaultSchema.attributes?.code || []).filter((attribute) => !Array.isArray(attribute) || attribute[0] !== "className"),
      "className",
      "dataClipboard",
    ],
    a: [
      ...(defaultSchema.attributes?.a || []).filter((attribute) => !Array.isArray(attribute) || attribute[0] !== "className"),
      "className",
    ],
    iframe: ["src", "title", "width", "height", "allow", "allowFullScreen", "frameBorder"],
    input: ["type", "checked", "disabled"],
    source: ["src", "type"],
    video: ["src", "controls", "width", "height"],
    audio: ["src", "controls"],
    object: ["data", "type", "width", "height", "ariaLabel"],
  },
};

function removeQuartzMermaidChrome() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return;
      const mermaidCode = node.children?.find((child) => (
        child.type === "element"
        && child.tagName === "code"
        && child.properties?.className?.includes("mermaid")
      ));
      if (mermaidCode) node.children = [mermaidCode];
    });
  };
}

function slugFromPath(path) {
  return normalizePath(path).replace(/\.md(?:own)?$/i, "");
}

export async function renderMarkdown(markdown, options = {}) {
  const path = options.path || "index.md";
  const { data: frontmatter, body } = parseFrontmatter(markdown);
  const transformed = quartzObsidian.textTransform
    ? quartzObsidian.textTransform(quartzContext, body)
    : body;

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(quartzObsidian.markdownPlugins?.(quartzContext) || [])
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(quartzObsidian.htmlPlugins?.(quartzContext) || [])
    .use(removeQuartzMermaidChrome)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeKatex, { output: "htmlAndMathml", throwOnError: false })
    .use(rehypeStringify);

  const file = new VFile({ value: transformed, path });
  file.data.slug = slugFromPath(path);
  file.data.relativePath = normalizePath(path);
  file.data.filePath = normalizePath(path);
  file.data.frontmatter = frontmatter;

  const result = await processor.process(file);
  return {
    html: String(result),
    frontmatter,
    hasMermaid: Boolean(result.data.hasMermaidDiagram),
    rendererVersion: RENDERER_VERSION,
  };
}
