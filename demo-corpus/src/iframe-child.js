setTimeout(async function exerciseFrameInternals() {
  console.warn("Expected iframe warning");
  await fetch(`http://127.0.0.1:${location.port}/api/ok?case=iframe-internal`);
}, 150);
