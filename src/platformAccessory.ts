import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { IndoorAirFilePlatform } from './platform.js';

import http from 'http';

type SensorData = {
  eco2: number;
  gas_kohms: number;
  humidity: number;
  pressure: number;
  temperature: number;
  tvoc: number;
  aqi: number;
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class IndoorAirPlatformAccessory {
  // private service: Service;
  
  private readonly name: string;
  private readonly url: string;
  private sensorData: SensorData;
  private readonly pollingInterval: number;
  private timer: NodeJS.Timeout | null = null;

  private readonly co2Service: Service;
  private readonly airQualityService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  // private readonly informationService: Service;


  constructor(
    private readonly platform: IndoorAirFilePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.name = this.platform.config.name || 'Indoor Air Sensor';
    this.url = this.platform.config.url || 'http://localhost:8080';
    this.sensorData = {
      eco2: 0,
      gas_kohms: 0,
      humidity: 0,
      pressure: 0,
      temperature: 0,
      tvoc: 0,
      aqi: 0
    };

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Chassot')
      .setCharacteristic(this.platform.Characteristic.Model, 'Air Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '42424242-4242');

    // get the CarbonDioxideSensor service if it exists, otherwise create a new CarbonDioxideSensor service
    // you can create multiple services for each accessory
    this.co2Service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) || this.accessory.addService(this.platform.Service.CarbonDioxideSensor);
    this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor) || this.accessory.addService(this.platform.Service.AirQualitySensor);
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor);
    
    
    
    
    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.co2Service.setCharacteristic(this.platform.Characteristic.Name, "CO2");
    this.airQualityService.setCharacteristic(this.platform.Characteristic.Name, "Air Quality");
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, "Temperature");
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, "Humidity");


    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
      .onGet(this.handleCarbonDioxideDetectedGet.bind(this))
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
      .onGet(this.handleCarbonDioxideLevelGet.bind(this));

    this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
      .onGet(this.handleAirQualityGet.bind(this));
    this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)
      .onGet(this.handleVOCGet.bind(this));

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));



    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same subtype id.)
     */

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */

    // Polling ------------------------------------------------------------------------------------

    this.pollingInterval = this.platform.config.pollingIntervalMS;
    this.platform.log.info("Polling interval is " + this.pollingInterval + " ms");

    let motionDetected = false;
    setInterval(() => {
      
      this.update_from_http_request((err, result) => {
        this.update_device_values();
      });
      // push the new value to HomeKit
      this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, this.sensorData.eco2);
      this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.get_co2_detected());
      this.airQualityService.updateCharacteristic(this.platform.Characteristic.AirQuality, this.get_air_quality());
      this.airQualityService.updateCharacteristic(this.platform.Characteristic.VOCDensity, this.sensorData.tvoc);
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.sensorData.temperature);
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.sensorData.humidity);
      
    }, this.pollingInterval);
    this.platform.log.info("IndoorAirSensor finished initializing!");
  } // END OF CONSTRUCTOR

  update_device_values() {
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected).updateValue
  }

  get_co2_detected() {
    if (this.sensorData.eco2 <= 1000) {
      return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
    } else {
      return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
    }
  }

  update_from_http_request(callback: (error: Error | null, result: boolean) => void) {
    this.platform.log.debug('Triggered Update from HTTP Request, url = ' + this.url);

    try {
      let req = http.get(this.url, res => {
        let recv_data = '';
        res.on('data', chunk => { recv_data += chunk });
        res.on('end', () => {
          // recv_data contains volume info.
          let json_values: SensorData = JSON.parse(recv_data);
          this.sensorData = json_values;
          this.platform.log.debug("Updated sensor data: " + JSON.stringify(this.sensorData));
          callback(null, true);
        });
      });
      req.on('error', err => {
        this.platform.log("Error in update_from_http_request: " + err.message);
      })

    } catch (error) {
      this.platform.log.error("Error while updating data from http request: " + error);
    }
  }

  /**
   * Handle requests to get the current value of the "Carbon Dioxide Detected" characteristic
   */
  async handleCarbonDioxideDetectedGet() {
    this.platform.log.debug('Triggered GET CarbonDioxideDetected');
    this.platform.log.debug("Current state of the CO2 sensor CO2Detected was returned: " + (this.sensorData.eco2 <= 1000 ? "NORMAL" : "ABNORMAL"));
    return this.get_co2_detected();
  }

  /**
   * Handle requests to get the current value of the "Carbon Dioxide Detected" characteristic
   */
  async handleCarbonDioxideLevelGet() {
    this.platform.log.debug('Triggered GET CarbonDioxideLevel');
    this.platform.log.debug("Current state of the CO2 sensor CO2Level was returned: " + (this.sensorData.eco2));
    return Math.round(this.sensorData.eco2);
  }

  get_air_quality() {
    if (this.sensorData.aqi == 1) {
      return this.platform.Characteristic.AirQuality.EXCELLENT;
    } else if (this.sensorData.aqi == 2) {
      return this.platform.Characteristic.AirQuality.GOOD;
    } else if (this.sensorData.aqi == 3) {
      return this.platform.Characteristic.AirQuality.FAIR;
    } else if (this.sensorData.aqi == 4) {
      return this.platform.Characteristic.AirQuality.INFERIOR;
    } else if (this.sensorData.aqi >= 5) {
      return this.platform.Characteristic.AirQuality.POOR;
    }
    return this.platform.Characteristic.AirQuality.UNKNOWN;
  }
  async handleAirQualityGet() {
    this.platform.log.debug('Triggered GET AirQuality');
    this.platform.log.debug("Current state of the AirQuality sensor was returned: " + (this.sensorData.eco2));

    return this.get_air_quality();
   
  }

  async handleVOCGet() {
    this.platform.log.debug('Triggered GET VOCDensity');
    this.platform.log.debug("Current state of the VOC sensor VOCDensity was returned: " + (this.sensorData.tvoc));
    return Math.round(this.sensorData.tvoc);
  }

  async handleCurrentTemperatureGet() {
    this.platform.log.debug('Triggered GET CurrentTemperature');
    this.platform.log.debug("Current state of the Temperature sensor CurrentTemperature was returned: " + (this.sensorData.temperature));
    return this.sensorData.temperature;
  }

  async handleCurrentRelativeHumidityGet() {
    this.platform.log.debug('Triggered GET CurrentRelativeHumidity');
    this.platform.log.debug("Current state of the Humidity sensor CurrentRelativeHumidity was returned: " + (this.sensorData.humidity));
    return Math.round(this.sensorData.humidity);
  }

  // /**
  //  * Handle "SET" requests from HomeKit
  //  * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
  //  */
  // async setOn(value: CharacteristicValue) {
  //   // implement your own code to turn your device on/off
  //   this.exampleStates.On = value as boolean;

  //   this.platform.log.debug('Set Characteristic On ->', value);
  // }

  // /**
  //  * Handle the "GET" requests from HomeKit
  //  * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
  //  *
  //  * GET requests should return as fast as possible. A long delay here will result in
  //  * HomeKit being unresponsive and a bad user experience in general.
  //  *
  //  * If your device takes time to respond you should update the status of your device
  //  * asynchronously instead using the `updateCharacteristic` method instead.

  //  * @example
  //  * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
  //  */
  // async getOn(): Promise<CharacteristicValue> {
  //   // implement your own code to check if the device is on
  //   const isOn = this.exampleStates.On;

  //   this.platform.log.debug('Get Characteristic On ->', isOn);

  //   // if you need to return an error to show the device as "Not Responding" in the Home app:
  //   // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

  //   return isOn;
  // }

  // /**
  //  * Handle "SET" requests from HomeKit
  //  * These are sent when the user changes the state of an accessory, for example, changing the Brightness
  //  */
  // async setBrightness(value: CharacteristicValue) {
  //   // implement your own code to set the brightness
  //   this.exampleStates.Brightness = value as number;

  //   this.platform.log.debug('Set Characteristic Brightness -> ', value);
  // }

}
