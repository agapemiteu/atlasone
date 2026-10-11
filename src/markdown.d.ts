// Recipes are bundled as text (wrangler "Text" module rule for **/*.md).
declare module "*.md" {
  const text: string;
  export default text;
}
