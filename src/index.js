"use strict";
module.exports = function (homebridge) {
  /*
        API.registerAccessory(PluginIdentifier,
            AccessoryName, AccessoryPluginConstructor)
    */
  homebridge.registerAccessory("homebridge-indoor-air-http", "IndoorAirFile", indoorAir);
};