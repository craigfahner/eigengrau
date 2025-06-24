function loadBRFv5Model(optionsOrCallback, cb) {
  let modelName = '68l';
  let numChunksToLoad = 8;
  //let pathToModels = 'https://tastenkunst.github.io/brfv5-browser/js/brfv5/models/';
  let pathToModels = './models/';
  let appId = 'brfv5.browser.minimal.nomodules';
  let onProgress = null;
  let callback;
  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
  } else {
    modelName = optionsOrCallback.modelName || modelName;
    numChunksToLoad = optionsOrCallback.numChunksToLoad || numChunksToLoad;
    pathToModels = optionsOrCallback.pathToModels || pathToModels;
    appId = optionsOrCallback.appId || appId;
    onProgress = optionsOrCallback.onProgress || onProgress;
    callback = cb;
  }

  if(!modelName) {
    throw new Error('Please provide a modelName.');
  }

  const brfv5 = {};
  let _brfv5Manager = null;
  let _brfv5Config = null;

  return new Promise((resolve, reject) => {
    if (_brfv5Manager && _brfv5Config) {
      if (callback) {
        callback(null, brfv5, _brfv5Manager, _brfv5Config);
      }
      resolve({
        brfv5: brfv5,
        brfv5Manager: _brfv5Manager,
        brfv5Config: _brfv5Config
      });
      return;
    }
    try {
      const libraryName = 'brfv5_js_tk240320_v5.1.5_trial.brfv5';
      brfv5.appId = appId;
      brfv5.binaryLocation = pathToModels + libraryName;
      brfv5.modelLocation = pathToModels + modelName + '_c';
      brfv5.modelChunks = numChunksToLoad; // 4, 6, 8
      brfv5.binaryProgress = onProgress;
      brfv5.binaryError = function(e) {
        if (callback) {
          callback(e, null, null, null);
        }
        reject(e);
      };
      brfv5.onInit = function(brfv5Manager, brfv5Config) {
        _brfv5Manager = brfv5Manager;
        _brfv5Config = brfv5Config;
        if (callback) {
          callback(null, brfv5, brfv5Manager, brfv5Config);
        }
        resolve({
          brfv5: brfv5,
          brfv5Manager: _brfv5Manager,
          brfv5Config: _brfv5Config
        });
      };

      brfv5Module(brfv5);
    } catch(e) {
      if (callback) {
        callback(e, null, null, null);
      }
      reject(e);
    }
  })
}

function configureBRFv5(
  brfv5Manager,
  brfv5Config,
  imageWidth,
  imageHeight,
  numFacesToTrack = 1,
  enableFaceTracking = true
) {
  const inputSize = min(imageWidth, imageHeight);
  const sizeFactor = inputSize / 480;

  brfv5Config.imageConfig.inputWidth  = imageWidth;
  brfv5Config.imageConfig.inputHeight = imageHeight;
  brfv5Config.faceDetectionConfig.regionOfInterest.setTo(0, 0, imageWidth, imageHeight);

  brfv5Config.faceDetectionConfig.minFaceSize = 144 * sizeFactor;
  brfv5Config.faceDetectionConfig.maxFaceSize = 480 * sizeFactor;

  if(imageWidth < imageHeight) {
    // Portrait mode: probably smartphone, faces tend to be closer to the camera, processing time is an issue,
    // so save a bit of time and increase minFaceSize.
    brfv5Config.faceDetectionConfig.minFaceSize = 240 * sizeFactor;
  }

  // Set face detection region of interest and parameters scaled to the image base size.

  brfv5Config.faceTrackingConfig.regionOfInterest.setTo(0, 0, imageWidth, imageHeight)
  brfv5Config.faceTrackingConfig.minFaceScaleStart = 50.0 * sizeFactor;
  brfv5Config.faceTrackingConfig.maxFaceScaleStart = 320.0 * sizeFactor;
  brfv5Config.faceTrackingConfig.minFaceScaleReset =  35.0 * sizeFactor;
  brfv5Config.faceTrackingConfig.maxFaceScaleReset = 420.0 * sizeFactor;
  brfv5Config.faceTrackingConfig.confidenceThresholdReset = 0.001;
  brfv5Config.faceTrackingConfig.enableStabilizer = true;
  brfv5Config.faceTrackingConfig.maxRotationXReset = 35.0;
  brfv5Config.faceTrackingConfig.maxRotationYReset = 45.0;
  brfv5Config.faceTrackingConfig.maxRotationZReset = 34.0;
  brfv5Config.faceTrackingConfig.numTrackingPasses = 3;
  brfv5Config.faceTrackingConfig.enableFreeRotation = true;
  brfv5Config.faceTrackingConfig.maxRotationZReset = 999.0;
  brfv5Config.faceTrackingConfig.numFacesToTrack = numFacesToTrack;
  brfv5Config.enableFaceTracking = enableFaceTracking;

  brfv5Manager.configure(brfv5Config);
}
