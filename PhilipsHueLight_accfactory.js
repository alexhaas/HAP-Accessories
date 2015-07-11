
var types = require("./types.js"); //homekit types
var exports = module.exports = {}; //homekit exports
var philipsHueInfo = require("./PhilipsHue_Info.js"); //philips hue connection parameters

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

var execute = function(accessory,lightID,characteristic,value) {
    var httpSync = require('http-sync');
    var characteristic = characteristic.toLowerCase();
    var body = {};
    if(characteristic === "identify") {
        body = {alert:"select"};
    } else if(characteristic === "on") {
        body = {on:value};
    } else if(characteristic === "hue") {
        body = {hue:value};
    } else  if(characteristic === "brightness") {
        value = value/100;
        value = value*255;
        value = Math.round(value);
        body = {bri:value};
    } else if(characteristic === "saturation") {
        value = value/100;
        value = value*255;
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
      console.log("Request Timedout!");
      timedout = true;
    });
    var response = request.end();

    if (!timedout) {
      console.log("Hue response:"+response.body.toString());
    }
    console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + "."); 
}

var newTemplateAccessory = function () {
    return {
        displayName: "",
      username: "",
      pincode: philipsHueInfo.philipsHueDevicePin,
      services: [{
        sType: types.ACCESSORY_INFORMATION_STYPE, 
        characteristics: [{
            cType: types.NAME_CTYPE, 
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of the accessory",
            designedMaxLength: 255    
        },{
            cType: types.MANUFACTURER_CTYPE, 
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: philipsHueInfo.philipsHueManufacturer,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Manufacturer",
            designedMaxLength: 255    
        },{
            cType: types.MODEL_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Model",
            designedMaxLength: 255    
        },{
            cType: types.SERIAL_NUMBER_CTYPE, 
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "SN",
            designedMaxLength: 255    
        },{
            cType: types.IDENTIFY_CTYPE, 
            onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.lightNumber, "identify", value); },
            perms: ["pw"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Identify Accessory",
            designedMaxLength: 1    
        }]
      },{
        sType: types.LIGHTBULB_STYPE, 
        characteristics: [{
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255   
        },{
            cType: types.POWER_STATE_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.lightNumber, "on", value); },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Turn On the Light",
            designedMaxLength: 1    
        },{
            cType: types.HUE_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.lightNumber, "hue", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Hue of Light",
            designedMinValue: 0,
            designedMaxValue: 65535,
            designedMinStep: 1,
            unit: "arcdegrees"
        },{
            cType: types.BRIGHTNESS_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.lightNumber, "brightness", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Brightness of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: "%"
        },{
            cType: types.SATURATION_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.lightNumber, "saturation", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Saturation of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: "%"
        }]
      }]
    }   
};

//the factory creates new accessory objects with the parameters that are passed
var philipsHueAccFactory = function (paramsObject) {

    if (typeof paramsObject === 'undefined') {
        console.log("philipsHueAccFactory requires an paramsObject!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {lightNumber, lightID, name, model}."};
    }
    if (typeof paramsObject.lightNumber !== 'number') {
        console.log("philipsHueAccFactory requires an paramsObject.groupAdress as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {lightNumber, lightID, name, model}."};
    }
    if (typeof paramsObject.lightID !== 'string') {
        console.log("philipsHueAccFactory requires an paramsObject.groupAdress as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {lightNumber, lightID, name, model}."};
    }
    if (typeof paramsObject.name !== 'string') {
        console.log("philipsHueAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {lightNumber, lightID, name, model}."};
    }
    if (typeof paramsObject.model !== 'string') {
        console.log("philipsHueAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {lightNumber, lightID, name, model}."};
    }
 
    var newAccessory = newTemplateAccessory();
    var name = "Philips Hue " + (paramsObject.model == "LCT002" ? "Lux " : "") + paramsObject.name;
    var serial = philipsHueInfo.philipsHueManufacturer.toUpperCase() + paramsObject.model.toUpperCase() + '-' + paramsObject.lightID.toString();

    newAccessory.displayName = name;
    newAccessory.username = serial;
    newAccessory.serialNumber = serial;
    newAccessory.locals = {
        lightNumber: paramsObject.lightNumber,
        lightID: paramsObject.lightID,
        name: name,
        model: paramsObject.model
    };
    newAccessory.services[0].characteristics[0].initialValue = name; // NAME_CTYPE
    newAccessory.services[0].characteristics[2].initialValue = paramsObject.model; // MODEL_CTYPE
    newAccessory.services[0].characteristics[3].initialValue = serial; // SERIAL_NUMBER_CTYPE
    newAccessory.services[1].characteristics[0].initialValue = name + " Light Service"; // must access object directly
    return newAccessory;
};

module.exports = (function () {
    var accessories = [];
    var index;
    getLights();
    for (index in lightList) {
        if (lightList.hasOwnProperty(index)) {
            accessories.push({accessory: philipsHueAccFactory(lightList[index])});
        }
    }
    return accessories;
}());


