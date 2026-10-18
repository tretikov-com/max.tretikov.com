import markdown from "./nda.md?raw";
import { parseFrontmatter } from "../vault/model.js";

const { data } = parseFrontmatter(markdown);
export const NDA_DOCUMENT = { version: data.version, markdown, href: "/nda" };
