import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "../shared/constants";
import { setEngine } from "./app/getEngine";
import { LoadScreen } from "./app/screens/LoadScreen";
import { StartScreen } from "./app/screens/start/StartScreen";
import { userSettings } from "./app/utils/userSettings";
import { CreationEngine } from "./engine/engine";

/**
 * Importing these modules will automatically register there plugins with the engine.
 */
import "@pixi/sound";
// import "@esotericsoftware/spine-pixi-v8";

// Create a new creation engine instance
const engine = new CreationEngine();
setEngine(engine);

(async () => {
  // Initialize the creation engine instance
  await engine.init({
    background: "#000000",
    // Transparent Pixi canvas: the Three.js world scene renders on a canvas
    // stacked behind it, while HUD/chat/labels stay in the Pixi overlay.
    backgroundAlpha: 0,
    width: VIEWBOX_WIDTH,
    height: VIEWBOX_HEIGHT,
    resizeOptions: {
      minWidth: VIEWBOX_WIDTH,
      minHeight: VIEWBOX_HEIGHT,
      letterbox: true,
    },
  });

  // Initialize the user settings
  userSettings.init();

  // Show the load screen
  await engine.navigation.showScreen(LoadScreen);
  // Let the player pick a name before joining the multiplayer world
  await engine.navigation.showScreen(StartScreen);
})();
