var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid;
var storage = require('node-persist'); //persistent storage for the nest auth token
var nestInfo;

try {
  nestInfo = require("./Nest_Info.js"); //nest connection parameters
}
catch (err) {
  console.log("Unable to read file Nest_Info.js: ", err);
  console.log("see Nest_Info_SAMPLE.js. for an example");
}

var nestList = []; //empty, we'll fill this when we talk to nest
var nestAccessToken = "";

function roundHalf(num) {
    return Math.round(num*2)/2;
}

function hashFnv32a(str, asString, seed) {
    /*jshint bitwise:false */
    var i, l,
        hval = (seed === undefined) ? 0x811c9dc5 : seed;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    if( asString ){
        // Convert to 8 digit hex string
        return ("0000000" + (hval >>> 0).toString(16)).substr(-8);
    }
    return hval >>> 0;
}

function genMAC(id){
    var hash = hashFnv32a(id, true);
    return "00:01:"+hash.split( /(?=(?:..)*$)/ ).join(":");
}

var getNestAccessToken = function() {
	var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'POST',
    headers: {},
    body: '',

    protocol: 'https',
    host: "api.home.nest.com",
    port: 443, //443 if protocol = https
    path: "/oauth2/access_token?code="+nestInfo.nestPIN+"&client_id="+nestInfo.nestClientID+"&client_secret="+nestInfo.nestClientSecret+"&grant_type=authorization_code"
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
    nestAccessToken = obj.access_token;
    //console.log("Token: "+nestAccessToken);
    storage.initSync();
    storage.setItem("nestAccessToken", obj.access_token);
  }	
};

var getNestThermostats = function() {
  console.log("Asking Nest for Thermostats...");
  var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    body: '',
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices?auth="+storage.getItem("nestAccessToken")
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
    var thermostats = obj.thermostats;
    for (var k in thermostats){
      if (typeof thermostats[k] !== 'function') {
        var thermostat = thermostats[k];
        var hvac_mode;
        switch(thermostat.hvac_mode) {
          case "heat":
            hvac_mode=Characteristic.CurrentHeatingCoolingState.HEAT;
            break;
          case "cool":
            hvac_mode=Characteristic.CurrentHeatingCoolingState.COOL;
            break;
          case "heat-cool":
            hvac_mode=3; //not officially supported in homekit types as of 9/17/15... maybe apple will fix? value of "auto" in simulator
            break;
          case "off":
          default:
            hvac_mode=Characteristic.CurrentHeatingCoolingState.OFF;
            break;
        }
        nestList.push({
          id: k,
          name: thermostat.name_long,
          temperature_scale: (thermostat.temperature_scale === "C" ? Characteristic.TemperatureDisplayUnits.CELSIUS : Characteristic.TemperatureDisplayUnits.FAHRENHEIT),
          current_heating_cooling_state: hvac_mode,
          target_heating_cooling_state: hvac_mode, //set target to same so we dont change anything
          current_temperature: thermostat["ambient_temperature_"+thermostat.temperature_scale.toLowerCase()]*1.0,
          target_temperature: thermostat["target_temperature_"+thermostat.temperature_scale.toLowerCase()]*1.0,
          current_relative_humidity: thermostat.humidity,
        });
      }
    }
  }
};


var execute = function(id,characteristic,value) {
  var httpSync = require('http-sync');
  var body = "";
  if(characteristic === "target_temperature") {
    characteristic += "_c";
    body = roundHalf(value*1.0); //nest requires 0.5 Celsius increments.
  }else if(characteristic === "hvac_mode") {
    switch(value) {
      case Characteristic.CurrentHeatingCoolingState.OFF:
        body = "off"
        break;
      case Characteristic.CurrentHeatingCoolingState.COOL:
        body = "cool"
        break;
      case Characteristic.CurrentHeatingCoolingState.HEAT:
        body = "heat"
        break;
      case 3: //auto
        body = "heat-cool"
        break;
      default:
        body = null;
    }
  }
  
  var post_data = JSON.stringify(body); 

  var request = httpSync.request({
    method: 'put',
    headers: {
      accept: 'application/json'
    },
    body: post_data,
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices/thermostats/"+id+"/"+characteristic+"?auth="+storage.getItem("nestAccessToken")
  });

  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timedout!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    console.log("Nest response: " + response.body.toString());
    //console.log(response.body.toString());
    //console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + ".");
  }
};

var getValue = function(id,characteristic) {
  var body = "";
  
  var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    body: '',
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices/thermostats/"+id+"?auth="+storage.getItem("nestAccessToken")
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
    var thermostat = obj;
    //console.log(thermostat.ambient_temperature_c);
    //console.log(typeof thermostat.ambient_temperature_c);
    
    var ret;
    switch(characteristic) {
    	case "current_temperature":
    		ret=thermostat.ambient_temperature_c;
    		break;
    	case "target_temperature":
    		ret=thermostat.target_temperature_c;
    		break;
      case "hvac_mode":
        switch(thermostat.hvac_mode) {
          case "heat":
            ret=Characteristic.CurrentHeatingCoolingState.HEAT;
            break;
          case "cool":
            ret=Characteristic.CurrentHeatingCoolingState.COOL;
            break;
          case "heat-cool":
            ret=3; //not officially supported in homekit types as of 9/17/15... maybe apple will fix? value of "auto" in simulator
            break;
          case "off":
            ret=Characteristic.CurrentHeatingCoolingState.OFF;
            break;
          default:
            ret=null;
        }
        break;
      case "humidity":
        ret=thermostat.humidity;
        break;
      case "temperature_scale":
        ret=(thermostat.temperature_scale === "C" ? Characteristic.TemperatureDisplayUnits.CELSIUS : Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
        break;
    	default:
    		ret=null;
    }
    return ret;
  }
};

//the factory creates new accessory objects with the parameters that are passed
var nestAccFactory = function (paramsObject) {

  var NEST_THERMOSTAT = {
    number: paramsObject.id,
    current_temperature: 32, // celsius
    target_temperature_: 32, // celsius
    temperature_scale: Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
    current_heating_cooling_state: Characteristic.CurrentHeatingCoolingState.OFF,
    target_heating_cooling_state: Characteristic.CurrentHeatingCoolingState.OFF,
    current_relative_humidity: 50, // 50%
    cooling_threshold_temperature: 32,
    heating_threshold_temperature: 32,
    
    setTemperature: function(temperature) {
      console.log("Setting thermostat temperature to %s", temperature);
      execute(NEST_THERMOSTAT.number, "target_temperature", temperature);
      NEST_THERMOSTAT.target_temperature = temperature;
    },
    setTargetHeatingCoolingState: function(state) {
      console.log("Setting thermostat target_heating_cooling_state to %s", state);
      execute(NEST_THERMOSTAT.number, "hvac_mode", state);
      NEST_THERMOSTAT.target_heating_cooling_state = state;
    }
  }

  var nestUUID = uuid.generate('"hap-nodejs:accessories:best:'+paramsObject.id);

  var name = "Nest " + paramsObject.name;
  var serial = genMAC(paramsObject.id);

  var nest = new Accessory(name, nestUUID);

  // Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
  nest.username = "1A:2B:3C:4D:5E:FF";
  nest.pincode = "031-45-154";

  nest
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "Nest")
    .setCharacteristic(Characteristic.Model, "NESTTHERMOSTAT")
    .setCharacteristic(Characteristic.SerialNumber, serial);

  nest
    .addService(Service.Thermostat, name); // services exposed to the user should have "names"

  // add required Characteristics

  // current temperature
  nest
    .getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', function(callback) {
      NEST_THERMOSTAT.current_temperature = getValue(NEST_THERMOSTAT.number, "current_temperature");
      callback(null, NEST_THERMOSTAT.current_temperature);
    });

  // target temperature
  nest
    .getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TargetTemperature)
    .on('get', function(callback) {
      NEST_THERMOSTAT.target_temperature = getValue(NEST_THERMOSTAT.number, "target_temperature");
      callback(null, NEST_THERMOSTAT.target_temperature);
    })
    .on('set', function(value, callback) {
      NEST_THERMOSTAT.setTemperature(value);
      callback();
    });

  // current heating cooling state
  nest
    .getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on('get', function(callback) {
      NEST_THERMOSTAT.current_heating_cooling_state = getValue(NEST_THERMOSTAT.number, "hvac_mode");
      callback(null, NEST_THERMOSTAT.current_heating_cooling_state);
    });

  // target heating cooling state
  nest
    .getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on('get', function(callback) {
      //NEST_THERMOSTAT.target_heating_cooling_state = getValue(NEST_THERMOSTAT.number, "hvac_mode");
      callback(null, NEST_THERMOSTAT.target_heating_cooling_state);
    })
    .on('set', function(value, callback) {
      NEST_THERMOSTAT.setTargetHeatingCoolingState(value);
      callback();
    });

  // display units (Nest only has read)
  nest
    .getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', function(callback) {
      NEST_THERMOSTAT.display_units = getValue(NEST_THERMOSTAT.number, "temperature_scale");
      callback(null, NEST_THERMOSTAT.display_units);
    });

  // relative humidity (Nest only has read) OPTIONAL
  nest
    .getService(Service.Thermostat)
    .addCharacteristic(Characteristic.CurrentRelativeHumidity)
    .on('get', function(callback) {
      NEST_THERMOSTAT.current_relative_humidity = getValue(NEST_THERMOSTAT.number, "humidity");
      callback(null, NEST_THERMOSTAT.current_relative_humidity);
    });

  return nest;
};

module.exports = (function() {
  var accessories = [];
  var index;

  //start persistent storage
  storage.initSync();

  //get nest token first
  if (typeof storage.getItem("nestAccessToken") === "undefined") {
    getNestAccessToken();
  } else {
    nestAccessToken = storage.getItem("nestAccessToken");
  }

  getNestThermostats();

  for (index in nestList) {
    if (nestList.hasOwnProperty(index)) {
      accessories.push(nestAccFactory(nestList[index]));
    }
  }
  return accessories;
}());