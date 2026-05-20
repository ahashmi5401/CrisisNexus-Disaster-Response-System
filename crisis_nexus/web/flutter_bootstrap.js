{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load({
  onEntrypointLoaded: async function(engineInitializer) {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.animation = 'none';
      progressBar.style.width = '100%';
      progressBar.style.transition = 'width 0.3s ease-out';
    }
    const appRunner = await engineInitializer.initializeEngine();
    await appRunner.runApp();
  }
});
