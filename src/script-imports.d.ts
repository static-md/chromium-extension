// `?script` imports resolve to the built file's path, for chrome.scripting.executeScript.
declare module '*?script' {
  const path: string;
  export default path;
}
