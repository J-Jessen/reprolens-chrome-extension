const openFrame = document.getElementById("open-frame");
const status = document.getElementById("status");
const frameHost = document.getElementById("frame-host");

openFrame.addEventListener("click", function openRelatedFrame() {
  const frame = document.createElement("iframe");
  frame.title = "Cross-origin trace fixture";
  frame.src = `http://localhost:${location.port}/demo-corpus/iframe-child.html`;
  frame.addEventListener("load", () => { status.textContent = "Cross-origin frame loaded"; });
  frameHost.replaceChildren(frame);
});
