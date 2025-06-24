// --- DOM stuff ---
var loadingText = document.getElementById("loadingText");
var widget = document.getElementById("widget");
var icon = document.getElementById("widgetIcon");
var widgetText = document.getElementById("widgetText");
var alertText = document.getElementById("alertText");
var calibButton = document.getElementById("recalibrate");
var contentBox = document.getElementById("content");

// --- eye openness stuff ---
var openness;
var opennessSamples = [];
var rollingAverage = 0;
var wd = 0; // width difference
var openSample = 0;
var closedSample = 0;
var baseThresh = 0;
var normalizedThresh = 0;
var threshPercentage = 0.62; // what percentage of the difference between the open and closed eye samples should indicate the "flip" point
var mobileThreshPercentage = 0.8; //different on mobile due to weird scaling - test this on multiple devices and orientations
//on mobile make thresh percentage higher
var threshScaleFactor = 0.026; 
var mobileThreshScaleFactor = 0.01;
var eyesAreClosed = false;

// --- end eye openness stuff ---

var s = 50; // global saturation
var b = 80; // global brightness

var socket = io();
var eyes = [];
var myHue = Math.floor(Math.random() * 360);
var eyesActive = false;

let brfv5 = null;
let brfv5Manager = null;
let brfv5Config = null;
var theHeight;

let loading = true;
let calibrating = false;
let capture;

var isMobile;
var clickOrTap;

var lEyeCoords = [];
var rEyeCoords = [];

var weStoppedSending = false;

// --- synth stuff ---
let ready = false; // wait for reverb to finish generating before starting
var audioStarted = false;
let myNote;
var myFilterValue = 0;

let synths = []; // received tones
const type = "triangle"; // sine, sawtooth, triangle, square
const volume = -10;
let reverb;

let mySynth; // client's synth
const filterMin = 100;
const filterMax = 8000;
const notes = ["D3", "F3", "G3", "A3", "C4", "E4", "G4", "A4", "C5", "D5"];



async function setup() {
  createCanvas(windowWidth, windowHeight);
  if (/Mobi/.test(navigator.userAgent)) {
    isMobile = true;
    widget.classList.add("scaleUpCorner");
    contentBox.classList.add("scaleUp");
    clickOrTap = "tap";
  } else {
    isMobile = false;

    clickOrTap = "click";
  }
  colorMode(HSB);

  // --- BRFv5 Stuff ---
  capture = createCapture(VIDEO);
  capture.size(640, 480); // change this based on device and orientation???

  capture.hide();
  capture.loadPixels();

  loadBRFv5Model(onBRFv5Load);
  // --- ///

  // --- synth stuff ---
  // set master volume
  Tone.Master.volume.value = volume;
  // setup reverb
  reverb = new Tone.Reverb({
    decay: 6,
    wet: 0.5,
    preDelay: 0.2
  });

  // initialize verb
  await reverb.generate();
  reverb.connect(Tone.Master);
  myNote = random(notes);
  mySynth = new Synth("me", myNote, 0.5);
  ready = true;
}

function draw() {
  background(0);

  //set up height stuff
  if (isMobile && width / height < 1.0) {
    //console.log('this is a portrait mode mobile device');
    theHeight = width * 1.3333333333;
    threshPercentage = mobileThreshPercentage; // set thresh percentage to be less sensitive on mobile - does this apply on android based phones?
    threshScaleFactor = mobileThreshScaleFactor; //likewise, use a less steep threshscalefactor on mobile - seems to work better
  } else {
    theHeight = width * 0.75;
    // maybe put the above mobileThreshPercentage line here too
  }

  if (loading) {
    return;
  }

  // update the face tracker
  capture.loadPixels();

  brfv5Manager.update(capture.imageData);

  push();
  translate(width, 0); // these 2 lines flip horizontally
  scale(-1, 1);

  // draw the webcam
  //image(capture, 0, 0, width, theHeight); // comment this out to hide the video
  background(0, 0, 0);

  //eye 1: coords 36-41
  ////top edge: 36 37 38 39
  //// bottom edge: 39 40 41 36

  let isDetectingFaces = !brfv5Config.enableFaceTracking;

  if (brfv5Config.enableFaceTracking) {
    let faces = brfv5Manager.getFaces();
    if (faces.length > 0) {
      let face = faces[0];

      // don't draw face tracking results if BRF is still finding them
      if (face.state !== brfv5.BRFv5State.FACE_TRACKING) {
        isDetectingFaces = true;
        eyesActive = false;
      } else {
        eyesActive = false;
        if (isNaN(face.vertices[0]) == false) {
          eyesActive = true;
          drawTrackedFace(face);
        }
      }
    }
  }

  if (!eyesActive && lEyeCoords.length > 0 && !weStoppedSending) {
    console.log("we lost the eyes");
    if (mySynth.on == true) {
      mySynth.noteOff();
      eyesAreClosed = false;
    }
    //send the last Coords and the off message
    sendPos(lEyeCoords, rEyeCoords, eyesActive, myFilterValue);

    weStoppedSending = true;
  }
  if (eyes.length > 0) {
    drawReceivedEyes();
  }
  pop();
  // --- user calibration prompts here ---
  fill(255);
  var userText;
  if (eyesActive == false) {
    userText = "Finding eyes...";
  } else if (eyesActive == true && openSample == 0) {
    userText = "Open your eyes, then " + clickOrTap + " the screen";
  } else if (eyesActive == true && openSample > 0 && closedSample == 0) {
    userText = "Close your eyes, then " + clickOrTap + " the screen";
  } else if (eyesActive == true && openSample > 0 && closedSample > 0) {
    userText = "";
  }

  //text(userText, width / 2, height / 2);
  setAlertText(userText);
}

function onBRFv5Load(err, _brfv5, _brfv5Manager, _brfv5Config) {
  if (err !== null) {
    print(err);
    return;
  }
  brfv5 = _brfv5;
  brfv5Manager = _brfv5Manager;
  brfv5Config = _brfv5Config;

  configureBRFv5(brfv5Manager, brfv5Config, capture.width, capture.height);

  loading = false;
}

function drawTrackedFace(face, drawBoundingBox = false) {
  weStoppedSending = false;

  //eye 1: coords 36-41
  ////top edge: 36 37 38 39
  //// bottom edge: 39 40 41 36
  //eye 2: coords 42-47
  ////top edge: 42 43 44 45
  ////bottom edge: 45 46 47 42

  //let's start by dumping the eye coords into clean arrays
  //(should there be a cleaner percentage version of this to send to the socket?)
  lEyeCoords = [];
  for (var i = 36; i < 42; i++) {
    var newCoord = {
      x: 0,
      y: 0
    };
    newCoord.x = map(face.landmarks[i].x, 0, capture.width, 0, width);
    newCoord.y = map(face.landmarks[i].y, 0, capture.height, 0, theHeight);
    lEyeCoords.push(newCoord);
  }

  rEyeCoords = [];
  for (var i = 42; i < 48; i++) {
    var newCoord = {
      x: 0,
      y: 0
    };
    newCoord.x = map(face.landmarks[i].x, 0, capture.width, 0, width);
    newCoord.y = map(face.landmarks[i].y, 0, capture.height, 0, theHeight);
    rEyeCoords.push(newCoord);
  }
  var myMidpoint = getEyeMidpoint(
    lEyeCoords[3].x,
    lEyeCoords[3].y,
    rEyeCoords[0].x,
    rEyeCoords[0].y
  );
  myFilterValue = dist(width / 2, height / 2, myMidpoint.x, myMidpoint.y);
  myFilterValue = map(
    myFilterValue,
    0,
    dist(width / 2, height / 2, width, height),
    1,
    0
  ); // filter value is num between 0 and 1, that increases as eyes get closer to centre of screen
  //this is where we send the Coords to the server
  sendPos(lEyeCoords, rEyeCoords, eyesActive, myFilterValue);

  strokeWeight(1.5);
  stroke(myHue, s, b); // set stroke for me
  noFill();
  for (var i = 0; i < 2; i++) {
    var theCoords;
    if (i == 0) {
      theCoords = lEyeCoords;
    } else {
      theCoords = rEyeCoords;
    }

    beginShape();
    curveVertex(theCoords[0].x, theCoords[0].y);
    for (var j = 0; j < theCoords.length; j++) {
      curveVertex(theCoords[j].x, theCoords[j].y);
      if (j == 3) {
        curveVertex(theCoords[j].x, theCoords[j].y); //turn the corner
      }
    }
    curveVertex(theCoords[0].x, theCoords[0].y);
    curveVertex(theCoords[0].x, theCoords[0].y); //last control point
    endShape();
  }

  fill(255, 255, 255);

  // --- calculate eye openness ---

  var lm = face.landmarks;
  var leftEyeLandmarks = [lm[36], lm[39], lm[37], lm[38], lm[41], lm[40]];
  var rightEyeLandmarks = [lm[45], lm[42], lm[44], lm[43], lm[46], lm[47]];

  push();

  translate(0, 0); // flip everything horizontally
  scale(-1, 1); //    so the text renders properly

  openness = eyeOpenness(leftEyeLandmarks, rightEyeLandmarks);
  getRollingAverage(openness);

  if (openSample > 0 && closedSample > 0) {
    baseThresh = openSample - (openSample - closedSample) * threshPercentage;
  }
  normalizedThresh = threshScaleFactor * wd + baseThresh; // this is the thing that determines the actual threshold

  if (rollingAverage > normalizedThresh) {
    eyesAreClosed = false;
    fill(255); // eyes are open
    if (mySynth.on == true) {
      mySynth.noteOff();
    }
  } else {
    eyesAreClosed = true;
    fill(0, 70, 50); // eyes are closed
    if (mySynth.on == false) {
      //console.log('starting synth');
      mySynth.noteOn();
      mySynth.updateFX(myFilterValue);
    } else {
      mySynth.updateFX(myFilterValue);
    }
  }

  //debug text below
  if (openSample > 0 && closedSample > 0) {
  //   text(
  //     "openness: " +
  //       openness.toFixed(2) +
  //       "\navg: " +
  //       rollingAverage.toFixed(2) +
  //       "\nclosed sample: " +
  //       closedSample.toFixed(2) +
  //       "\nopen sample: " +
  //       openSample.toFixed(2) +
  //       "\nwidthdiff: " +
  //       wd.toFixed(2) +
  //       "\nbase thresh: " +
  //       baseThresh.toFixed(2) +
  //       "\nnormalized thresh: " +
  //       normalizedThresh.toFixed(2),
  //     -(width / 2),
  //     (height / 3) * 2
  //   );
  }

  pop();
}

function drawReceivedEyes() {
  for (var e = 0; e < eyes.length; e++) {
    var originalWidth = eyes[e].w;
    var sF = width / originalWidth;

    for (var i = 0; i < 2; i++) {
      var theCoords;
      if (i == 0) {
        theCoords = eyes[e].lEye;
      } else {
        theCoords = eyes[e].rEye;
      }
      //text((theCoords[0].x * scaleFactor), width/2, 100);

      stroke(eyes[e].hue, s, b);
      noFill();
      //console.log(e + ' ' + eyes[e].on);

      if (eyes[e].on) {
        beginShape();
        curveVertex(theCoords[0].x * sF, theCoords[0].y * sF);
        for (var j = 0; j < theCoords.length; j++) {
          curveVertex(theCoords[j].x * sF, theCoords[j].y * sF);
          if (j == 3) {
            curveVertex(theCoords[j].x * sF, theCoords[j].y * sF); //turn the corner
          }
        }
        curveVertex(theCoords[0].x * sF, theCoords[0].y * sF);
        curveVertex(theCoords[0].x * sF, theCoords[0].y * sF); //last control point
        endShape();
        if (eyes[e].closed == true) {
          if (eyes[e].synth.on == false) {
            console.log("playing my friend note");
            eyes[e].synth.noteOn();
            eyes[e].synth.updateFX(eyes[e].fv);
          } else {
            eyes[e].synth.updateFX(eyes[e].fv);
          }
        } else {
          eyes[e].synth.noteOff();
        }
      } else {
        eyes[e].synth.noteOff();
      }
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

//// --- SOCKET STUFF HERE --- ////
function sendPos(lEye, rEye, on, fv) {
  //console.log(socket.id);
  var hue = myHue;
  var id = socket.id;
  var w = width;
  var note = myNote;
  var closed = eyesAreClosed;
  socket.emit("eyeChange", { lEye, rEye, w, on, hue, note, id, closed, fv });
}

socket.on("incomingNote", data => {
  console.log("we received the note " + data);
  myNote = data;
  if (mySynth != null) {
    mySynth.note = myNote;
  }
});

socket.on("incomingEyes", data => {
  //console.log(data);
  var alreadyExists = false;
  if (eyes.length > 0) {
    for (var i = 0; i < eyes.length; i++) {
      if (eyes[i].id == data.id) {
        alreadyExists = true;
        eyes[i].lEye = data.lEye;
        eyes[i].rEye = data.rEye;
        eyes[i].w = data.w;
        eyes[i].on = data.on;
        eyes[i].closed = data.closed;
        eyes[i].fv = data.fv;
      }
    }
  }
  if (alreadyExists == false) {
    eyes.push(data);
    eyes[eyes.length - 1].synth = new Synth(
      eyes[eyes.length - 1].id,
      eyes[eyes.length - 1].note,
      eyes[eyes.length - 1].fv
    );
    console.log("received new eyes: " + eyes[eyes.length - 1].id);
  }
});

socket.on("removeEyes", data => {
  var theIndex = -1;
  for (var i = 0; i < eyes.length; i++) {
    if (eyes[i].id == data) {
      theIndex = i;
      eyes[i].synth.noteOff();
    }
  }
  if (theIndex > -1) {
    console.log("removing eyes");
    console.log(eyes);
    eyes.splice(theIndex, 1);
    console.log(eyes);
  } else {
    console.log("no touches to delete");
  }
});

function eyeOpenness(eye0, eye1) {
  var eye0Openness = calculateEyeOpenness(
    eye0[0],
    eye0[1],
    eye0[2],
    eye0[3],
    eye0[4],
    eye0[5]
  );
  var eye1Openness = calculateEyeOpenness(
    eye1[0],
    eye1[1],
    eye1[2],
    eye1[3],
    eye1[4],
    eye1[5]
  );
  var avgOpenness = (eye0Openness + eye1Openness) / 2;

  var ewc = eyeWidthCalc(eye0[0], eye0[1], eye1[0], eye1[1]);
  wd = abs(ewc.eye0 - ewc.eye1);

  var returnedValue;

  if (wd > 14) {
    // experimental: this would only use the most visible eye if the face is turned.
    if (ewc.eye0 > ewc.eye1) {
      // for now it conflicts too much with the normalization function
      //console.log("eye0 is bigger");  // if we were to use it, i would make a 'normalized WD' variable that would
      returnedValue = eye0Openness; // intervene on the 'real' wd variable, so that a more 'straight on' wd value is used when the
    } else {
      // 'closest eye' is being preferred using this section
      //console.log("eye1 is bigger");
      returnedValue = eye1Openness;
    }
  } else {
    returnedValue = avgOpenness; // to turn this on, change 'avgOpenness' below to 'returnedValue'
  }

  //var eyeOpennessString = eye0Openness + ' ' + eye1Openness;

  return avgOpenness;
}

function calculateEyeOpenness(
  eyeOuterCorner,
  eyeInnerCorner,
  eyeOuterUpperLid,
  eyeInnerUpperLid,
  eyeOuterLowerLid,
  eyeInnerLowerLid
) {
  var eyeWidth = dist(
    eyeOuterCorner.x,
    eyeOuterCorner.y,
    eyeInnerCorner.x,
    eyeInnerCorner.y
  );
  var eyeOuterLidDistance = dist(
    eyeOuterUpperLid.x,
    eyeOuterUpperLid.y,
    eyeOuterLowerLid.x,
    eyeOuterLowerLid.y
  );
  var eyeInnerLidDistance = dist(
    eyeInnerUpperLid.x,
    eyeInnerUpperLid.y,
    eyeInnerLowerLid.x,
    eyeInnerLowerLid.y
  );
  var eyeLidDistance =
    2.0 * ((eyeOuterLidDistance + eyeInnerLidDistance) / eyeWidth);
  return eyeLidDistance;
}

function eyeWidthCalc(
  eye0OuterCorner,
  eye0InnerCorner,
  eye1OuterCorner,
  eye1InnerCorner
) {
  // this needs to be redone to account for different face depths. not reliable on phones for now
  // normalize to the total width of both eyes? (dist between the edges of either eye?)
  var eye0Width = dist(
    eye0OuterCorner.x,
    eye0OuterCorner.y,
    eye0InnerCorner.x,
    eye0InnerCorner.y
  );
  var eye1Width = dist(
    eye1OuterCorner.x,
    eye1OuterCorner.y,
    eye1InnerCorner.x,
    eye1InnerCorner.y
  );
  var totalEyesWidth = dist(
    eye0OuterCorner.x,
    eye0OuterCorner.y,
    eye1OuterCorner.x,
    eye1OuterCorner.y
  );
  eye0Width = (eye0Width / totalEyesWidth) * 100;
  eye1Width = (eye1Width / totalEyesWidth) * 100;
  var eyeWidths = {
    eye0: eye0Width,
    eye1: eye1Width
  };
  //return abs(eye0Width-eye1Width);
  return eyeWidths;
}

function getEyeMidpoint(x1, y1, x2, y2) {
  var midpoint = {
    x: 0,
    y: 0
  };
  midpoint.x = (x1 + x2) / 2;
  midpoint.y = (y1 + y1) / 2;
  return midpoint;
}

function mouseClicked() {
  calibrationCheck();
}

function calibrationCheck() {
  if (eyesActive == true) {
    if (openSample == 0) {
      openSample = rollingAverage;
    } else if (openSample > 0 && closedSample == 0) {
      closedSample = rollingAverage;
    }
  }
}

function getRollingAverage(theValue) {
  opennessSamples.push(theValue);
  while (opennessSamples.length > 5) {
    opennessSamples.shift();
  }
  var runningTotal = 0;
  for (var i = 0; i < opennessSamples.length; i++) {
    runningTotal = runningTotal + opennessSamples[i];
  }
  rollingAverage = runningTotal / opennessSamples.length;
}

function keyPressed() {
  if (key == "c") {
    closedSample = rollingAverage;
  } else if (key == "o") {
    openSample = rollingAverage;
  }
}

function touchStarted() {
  if (isMobile) {
    //userStartAudio(); // will this work/be necessary using tonejs?
    calibrationCheck();
  }
}

function resetCalibration() {
  openSample = 0;
  closedSample = 0;
}

// --- synth class ---
class Synth {
  constructor(id, note, fv) {
    //console.log('constructing');
    this.id = id;
    this.note = note;
    this.fv = fv;
    this.on = false;

    //this.effect = new Tone.FeedbackDelay(0.4, 0.85);
    this.effect = new Tone.Vibrato(1, 0.75); //modulate the depth or frequency with face movement / eye scale / ??
    //console.log(this.effect.frequency.value);
    this.filter = new Tone.Filter();
    this.filter.type = "lowpass";

    this.syn = new Tone.Synth({
      oscillator: {
        // fat prefix gives it a detuned/chorus effect
        type: `fat${type}`,
        count: 3,
        spread: 10
      },
      envelope: {
        attack: 2,
        decay: 0.1,
        sustain: 0.5,
        release: 0.1,
        attackCurve: "exponential"
      }
    });

    this.syn.connect(this.filter);
    this.filter.connect(this.effect);
    this.effect.connect(reverb);
  }

  noteOn() {
    if (this.syn) this.syn.triggerAttack(this.note);
    this.on = true;
    //console.log(this.id + " note on");
  }
  noteOff() {
    if (this.syn) this.syn.triggerRelease();
    this.on = false;
    //console.log(this.id + " note off");
  }
  updateFX(filt) {
    this.fv = filt;
    this.filter.frequency.value = lerp(filterMin, filterMax, filt);
  }
}

//--- DOM STUFF ---
icon.addEventListener("click", () => {
  if (icon.innerHTML.trim() == "i") {
    openWidget();
  } else if (icon.innerHTML.trim() == "x") {
    closeWidget();
  }
});

widget.addEventListener("transitionend", () => {
  if (icon.innerHTML.trim() == "i") {
  } else if (icon.innerHTML.trim() == "x") {
    widgetText.classList.remove("minimizedText");
    widgetText.classList.add("expandedText");
  }
});

function setAlertText(text) {
  if (loadingText.style.display != "none") {
    loadingText.style.display = "none";
  }
  alertText.classList.remove("hidden");
  alertText.innerHTML = text;
}

function openWidget() {
  widget.classList.remove("minimized");
  widget.classList.add("expanded");
  icon.classList.remove("minimizedIcon");
  icon.classList.add("hiddenIcon");
  icon.innerHTML = "x";
}

function closeWidget() {
  widget.classList.remove("expanded");
  widget.classList.add("minimized");
  icon.classList.remove("hiddenIcon");
  icon.classList.add("minimizedIcon");
  widgetText.classList.remove("expandedText");
  widgetText.classList.add("minimizedText");
  icon.innerHTML = "i";
}

calibButton.addEventListener("click", () => {
  setTimeout(() => {
    resetCalibration();
  }, 100);
  closeWidget();
});
