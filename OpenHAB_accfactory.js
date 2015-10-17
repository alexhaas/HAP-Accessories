var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid;
var openHabInfo;

//open up the info.
try {
  openHabInfo = require("./OpenHAB_Info.js"); //philips hue connection parameters
}
catch (err) {
  console.log("Unable to read file OpenHAB_Info.js: ", err);
  console.log("see OpenHAB_Info_SAMPLE.js. for an example");
}

var lightList = [];

var getLights = function() {
  var httpSync = require('http-sync');

  var request = httpSync.request({
      method: 'GET',
      headers: {
        accept: 'application/json'
      },
      body: '',
      protocol: 'http',
      host: openHabInfo.openHabIP,
      port: 8080,
      path: "/rest/items"
    });

    var timedout = false;
    request.setTimeout(10000, function() {
      console.log("Request Timedout!");
      timedout = true;
    });
    var response = request.end();

    if (!timedout) {
      // console.log(response);
      // console.log(response.body.toString());

      var obj = JSON.parse(response.body);
      console.log(obj);
      for (var k in obj["item"]){
        if (typeof obj["item"][k] !== 'function') {
          console.log(obj["item"][k]);
          var light = obj["item"][k];
          if(light.name.toLowerCase().indexOf("_hklight") > -1){
            // only add it if it has light in the name... #hax
            lightList.push({
              name: light.name
            });
          }
        }
      }
    }
};

var execute = function(lightID,characteristic,value) {
    var httpSync = require('http-sync');
    var characteristic = characteristic.toLowerCase();
    var body = {};
    if(characteristic === "on") {
      if(value) {
        body = "ON"
      } else {
        body = "OFF"
      }
    }
    
    var post_data = body; //JSON.stringify(body); 
    
    console.log("sending "+body+" to "+lightID);

    // An object of options to indicate where to post to
    var request = httpSync.request({
      host: openHabInfo.openHabIP,
      body: post_data,
      port: '8080',
      path: '/rest/items/' + lightID,
      method: 'POST',
      headers: {
        "Content-Type": "text/plain",
      }
    });
    
    var timedout = false;
    request.setTimeout(10000, function() {
      console.log("Request Timed Out!");
      timedout = true;
    });
    var response = request.end();

    if (!timedout) {
      console.log("OpenHAB response:"+response.body.toString());
    }
    //console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + "."); 
}

var getValues = function(lightID) {
  var httpSync = require('http-sync');
  //var characteristic = characteristic.toLowerCase();

  console.log("Updating values for light: "+lightID);
    
  // An object of options to indicate where to post to
  var request = httpSync.request({
    host: openHabInfo.openHabIP,
    body: null,
    port: '8080',
    path: '/rest/items/' + lightID,
    method: 'GET',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': 0
    }
  });
  
  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timed Out!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    console.log("OpenHAB response:"+response.body.toString());
    var state = response.body.toString();

    var on = (response.body.toString() === "ON" ? true : false);

    var ret = {
      on: on,
    }

    return ret;
  }
};

//the factory creates new accessory objects with the parameters that are passed
var openHabLightAccFactory = function (paramsObject) {

  var OPENHAB_LIGHT = {
    name: paramsObject.name,
    lastUpdated: 0,
    powerOn: false,
    
    setPowerOn: function(on) { 
      console.log("Turning the light %s!", on ? "on" : "off");
      execute(OPENHAB_LIGHT.name, "on", on);
      OPENHAB_LIGHT.powerOn = on;
    },
    updateValues: function() {
      var d = new Date();
      var curTime = d.getTime();
      if(OPENHAB_LIGHT.lastTime >= curTime - 2000) return; //skip this, we already updated
      OPENHAB_LIGHT.lastTime = curTime;
      var values = getValues(OPENHAB_LIGHT.name);

      OPENHAB_LIGHT.powerOn = values.on;
    }
  }

  var lightUUID = uuid.generate('"hap-nodejs:accessories:openhab:'+paramsObject.name);

  // var name = "Philips Hue " + (paramsObject.model.substr(0,3) == "LWB" ? "Lux " : "") + paramsObject.name;
  // var serial = philipsHueInfo.philipsHueManufacturer.toUpperCase() + paramsObject.model.toUpperCase() + '-' + paramsObject.lightID.toString();

  var light = new Accessory(paramsObject.name, lightUUID);

  // Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
  light.username = "1A:2B:3C:4D:5E:FF";
  light.pincode = "031-45-154";

  light
    .getService(Service.AccessoryInformation);
    // .setCharacteristic(Characteristic.Manufacturer, philipsHueInfo.philipsHueManufacturer)
    // .setCharacteristic(Characteristic.Model, paramsObject.model)
    // .setCharacteristic(Characteristic.SerialNumber, serial);

  // // listen for the "identify" event for this Accessory
  // light.on('identify', function(paired, callback) {
  //   OPENHAB_LIGHT.identify();
  //   callback(); // success
  // });

  // Add the actual Lightbulb Service and listen for change events from iOS.
  // We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
  light
    .addService(Service.Lightbulb, paramsObject.name) // services exposed to the user should have "names" like "Fake Light" for us
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
      OPENHAB_LIGHT.setPowerOn(value);
      callback(); // Our fake Light is synchronous - this value has been successfully set
    });

  // We want to intercept requests for our current power state so we can query the hardware itself instead of
  // allowing HAP-NodeJS to return the cached Characteristic.value.
  light
    .getService(Service.Lightbulb)
    .getCharacteristic(Characteristic.On)
    .on('get', function(callback) {
      
      // this event is emitted when you ask Siri directly whether your light is on or not. you might query
      // the light hardware itself to find this out, then call the callback. But if you take longer than a
      // few seconds to respond, Siri will give up.
      
      var err = null; // in case there were any problems

      OPENHAB_LIGHT.updateValues(); // refresh
    
      callback(err, OPENHAB_LIGHT.powerOn);
    });
  
  return light;
};

module.exports = (function () {
  var accessories = [];
  var index;
  getLights();
  for (index in lightList) {
    if (lightList.hasOwnProperty(index)) {
      accessories.push(openHabLightAccFactory(lightList[index]));
    }
  }
  return accessories;
}());


