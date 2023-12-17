"use strict";
module.exports = function (homebridge) {
  /*
        API.registerAccessory(PluginIdentifier,
            AccessoryName, AccessoryPluginConstructor)
    */
  homebridge.registerAccessory("homebridge-indoor-air-http", "Indoor Air Information", indoorAir);
};

function indoorAir(log, config, api) {
  this.log = log;
  this.config = config;
  this.homebridge = api;

  if (this.config.url)
      this.url = this.config.url;
  else
      this.url = "http://localhost:8080";

  this.log('Indoor Air information plugin created!');
  this.log('URL is ' + this.url);
};