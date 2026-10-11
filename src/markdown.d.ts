// Recipes are bundled as text (wrangler "Text" module rule for **/*.md).
declare module "*.md" {
  const text: string;
  export default text;
}

// The model-server script, bundled so wake-on-demand can push it to Kaggle.
declare module "*.py" {
  const text: string;
  export default text;
}
