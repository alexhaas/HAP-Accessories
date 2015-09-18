var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid;
var philipsHueInfo;

//open up the info.
try {
  philipsHueInfo = require("./PhilipsHue_Info.js"); //philips hue connection parameters
}
catch (err) {
  console.log("Unable to read file PhilipsHue_Info.js: ", err);
  console.log("see PhilipsHue_Info_SAMPLE.js. for an example");
}

var lightList = [];

var getLights = function() {
  //http://<ip of your bridge>/api/<username>/lights
  var httpSync = require('http-sync');

  var request = httpSync.request({
      method: 'GET',
      headers: {
        //accept: 'application/json'
      },
      body: '',
      protocol: 'http',
      host: philipsHueInfo.philipsHueIP,
      port: 80, //443 if protocol = https
      path: "/api/"+philipsHueInfo.philipsHueUsername+"/lights"
    });

    var timedout = false;
    request.setTimeout(10000, function() {
      console.log("Request Timedout!");
      timedout = true;
    });
    var response = request.end();

    if (!timedout) {
      //console.log(response);
      //console.log(response.body.toString());

      var obj = JSON.parse(response.body);
      for (var k in obj){
        if (typeof obj[k] !== 'function') {
          var light = obj[k];
          lightList.push({
            lightNumber: parseInt(k),
            lightID: light.uniqueid,
            model: light.modelid,
            name: light.name
          });
        }
      }
    }
};

var execute = function(lightID,characteristic,value) {
    var httpSync = require('http-sync');
    var characteristic = characteristic.toLowerCase();
    var body = {};
    if(characteristic === "identify") {
      body = {alert:"select"};
    } else if(characteristic === "on") {
      body = {on:value};
    } else if(characteristic === "hue") {
      value = value/360 * 65535;
      value = Math.round(value);
      body = {hue:value};
    } else  if(characteristic === "brightness") {
      value = value/100 * 254;
      value = Math.round(value);
      body = {bri:value};
    } else if(characteristic === "saturation") {
      value = value/100 * 254;
      value = Math.round(value);
      body = {sat:value};
    }  
    
    var post_data = JSON.stringify(body); 
    
    // An object of options to indicate where to post to
    var request = httpSync.request({
      host: philipsHueInfo.philipsHueIP,
      body: post_data,
      port: '80',
      path: '/api/' + philipsHueInfo.philipsHueUsername + '/lights/' + lightID + '/state/',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': post_data.length
      }
    });
    
    var timedout = false;
    request.setTimeout(10000, function() {
      console.log("Request Timed Out!");
      timedout = true;
    });
    var response = request.end();

    if (!timedout) {
      //console.log("Hue response:"+response.body.toString());
    }
    //console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + "."); 
}

var getValues = function(lightID) {
  var httpSync = require('http-sync');
  //var characteristic = characteristic.toLowerCase();

  console.log("Updating values for light: "+lightID);
    
  // An object of options to indicate where to post to
  var request = httpSync.request({
    host: philipsHueInfo.philipsHueIP,
    body: null,
    port: '80',
    path: '/api/' + philipsHueInfo.philipsHueUsername + '/lights/' + lightID,
    method: 'GET',
    headers: {
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
    //console.log("Hue response:"+response.body.toString());
    var state = JSON.parse(response.body).state;

    var ret = {
      on: state.on,
      brightness: Math.round(state.bri / 254 * 100)
    }
    if('hue' in state) {
      //full color
      ret.hue = Math.round(state.hue / 65535 * 360);
      ret.saturation = Math.round(state.sat / 254 * 100);
    }

    return ret;
  }
};

//the factory creates new accessory objects with the parameters that are passed
var philipsHueAccFactory = function (paramsObject) {

  var HUE_LIGHT = {
    number: paramsObject.lightNumber,
    lastUpdated: 0,
    powerOn: false,
    brightness: 100, // percentage
    
    setPowerOn: function(on) { 
      console.log("Turning the light %s!", on ? "on" : "off");
      execute(HUE_LIGHT.number, "on", on);
      HUE_LIGHT.powerOn = on;
    },
    setBrightness: function(brightness) {
      console.log("Setting light brightness to %s", brightness);
      execute(HUE_LIGHT.number, "brightness", brightness);
      HUE_LIGHT.brightness = brightness;
    },
    identify: function() {
      console.log("Identify the light!");
      execute(HUE_LIGHT.number, "identify", null);
    },
    updateValues: function() {
      var d = new Date();
      var curTime = d.getTime();
      if(HUE_LIGHT.lastTime >= curTime - 2000) return; //skip this, we already updated
      HUE_LIGHT.lastTime = curTime;
      var values = getValues(HUE_LIGHT.number);

      HUE_LIGHT.powerOn = values.on;
      HUE_LIGHT.brightness = values.brightness;

      if('hue' in values) {
        HUE_LIGHT.hue = values.hue;
        HUE_LIGHT.saturation = values.saturation;
      }

    }
  }

  var lightUUID = uuid.generate('"hap-nodejs:accessories:hue:'+paramsObject.lightID);

  var name = "Philips Hue " + (paramsObject.model.substr(0,3) == "LWB" ? "Lux " : "") + paramsObject.name;
  var serial = philipsHueInfo.philipsHueManufacturer.toUpperCase() + paramsObject.model.toUpperCase() + '-' + paramsObject.lightID.toString();

  var light = new Accessory(name, lightUUID);

  // Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
  light.username = "1A:2B:3C:4D:5E:FF";
  light.pincode = "031-45-154";

  light
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, philipsHueInfo.philipsHueManufacturer)
    .setCharacteristic(Characteristic.Model, paramsObject.model)
    .setCharacteristic(Characteristic.SerialNumber, serial);

  // listen for the "identify" event for this Accessory
  light.on('identify', function(paired, callback) {
    HUE_LIGHT.identify();
    callback(); // success
  });

  // Add the actual Lightbulb Service and listen for change events from iOS.
  // We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
  light
    .addService(Service.Lightbulb, name) // services exposed to the user should have "names" like "Fake Light" for us
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
      HUE_LIGHT.setPowerOn(value);
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

      HUE_LIGHT.updateValues(); // refresh
    
      callback(err, HUE_LIGHT.powerOn);
    });

  // also add an "optional" Characteristic for Brightness
  light
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Brightness)
    .on('get', function(callback) {
      HUE_LIGHT.updateValues(); // refresh
      callback(null, HUE_LIGHT.brightness);
    })
    .on('set', function(value, callback) {
      HUE_LIGHT.setBrightness(value);
      callback();
    });

  if(paramsObject.model.substr(0,3) == "LCT") {
    //this is a color hue
    HUE_LIGHT.hue = 0;
    HUE_LIGHT.saturation = 254;

    HUE_LIGHT.setHue = function(hue) {
      console.log("Setting light hue to %s", hue);
      execute(HUE_LIGHT.number, "hue", hue);
      HUE_LIGHT.hue = hue;
    };
    HUE_LIGHT.setSaturation = function(saturation) {
      console.log("Setting light hue to %s", saturation);
      execute(HUE_LIGHT.number, "saturation", saturation);
      HUE_LIGHT.saturation = saturation;
    };

    light
      .getService(Service.Lightbulb)
      .addCharacteristic(Characteristic.Saturation)
      .on('get', function(callback) {
        HUE_LIGHT.updateValues(); // refresh
        callback(null, HUE_LIGHT.saturation);
      })
      .on('set', function(value, callback) {
        HUE_LIGHT.setSaturation(value);
        callback();
      });

    light
      .getService(Service.Lightbulb)
      .addCharacteristic(Characteristic.Hue)
      .on('get', function(callback) {
        HUE_LIGHT.updateValues(); // refresh
        callback(null, HUE_LIGHT.hue);
      })
      .on('set', function(value, callback) {
        HUE_LIGHT.setHue(value);
        callback();
      });
  }
  
  return light;
};

module.exports = (function () {
  var accessories = [];
  var index;
  getLights();
  for (index in lightList) {
    if (lightList.hasOwnProperty(index)) {
      accessories.push(philipsHueAccFactory(lightList[index]));
    }
  }
  return accessories;
}());


