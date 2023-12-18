import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service
} from "homebridge";
import http from 'http';
/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("IndoorAirSensor", IndoorAirSensor);
};

type SensorData = {
  eco2: number;
  gas_kohms: number;
  humidity: number;
  pressure: number;
  temperature: number;
  tvoc: number;
  aqi: number;
};
class IndoorAirSensor implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly name: string;
  private readonly url: string;
  private sensorData: SensorData;
  private readonly pollingInterval: number;
  private timer: NodeJS.Timeout | null = null;

  private readonly co2Service: Service;
  private readonly airQualityService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.url = config.url;

    this.sensorData = {
      eco2: 0,
      gas_kohms: 0,
      humidity: 0,
      pressure: 0,
      temperature: 0,
      tvoc: 0,
      aqi: 0,
    };

    // CO2 Service --------------------------------------------------------------------------------
    this.co2Service = new hap.Service.CarbonDioxideSensor(this.name + " CO2 Sensor");
    this.co2Service.getCharacteristic(hap.Characteristic.CarbonDioxideDetected)
      .onGet(this.handleCarbonDioxideDetectedGet.bind(this))

    this.co2Service.getCharacteristic(hap.Characteristic.CarbonDioxideLevel)
      .onGet(this.handleCarbonDioxideLevelGet.bind(this));

    
    // Air Quality Service ------------------------------------------------------------------------
    this.airQualityService = new hap.Service.AirQualitySensor(this.name + " Air Quality Sensor");
    this.airQualityService.getCharacteristic(hap.Characteristic.AirQuality)
      .onGet(this.handleAirQualityGet.bind(this));
    
    this.airQualityService.getCharacteristic(hap.Characteristic.VOCDensity)
      .onGet(this.handleVOCGet.bind(this));

    // Temperature Service ------------------------------------------------------------------------
    this.temperatureService = new hap.Service.TemperatureSensor(this.name + " Temperature Sensor");
    this.temperatureService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    // Humidity Service ---------------------------------------------------------------------------
    this.humidityService = new hap.Service.HumiditySensor(this.name + " Humidity Sensor");
    this.humidityService.getCharacteristic(hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));

    // Information Service ------------------------------------------------------------------------
    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Samuel Inc.")
      .setCharacteristic(hap.Characteristic.Model, "Indoor air sensor ref 109277492");

    

    // Polling ------------------------------------------------------------------------------------

      this.pollingInterval = config.pollingIntervalMS;
    this.log.info("Polling interval is " + this.pollingInterval + " ms");
    this.timer = setTimeout(this.poll.bind(this), this.pollingInterval);

    log.info("IndoorAirSensor finished initializing!");
  }

  get_co2_detected() {
    if (this.sensorData.eco2 <= 1000) {
      return hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
    } else {
      return hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
    }
  }
  /**
   * Handle requests to get the current value of the "Carbon Dioxide Detected" characteristic
   */
  handleCarbonDioxideDetectedGet() {
    this.log.info('Triggered GET CarbonDioxideDetected');
    this.log.info("Current state of the CO2 sensor CO2Detected was returned: " + (this.sensorData.eco2 <= 1000 ? "NORMAL" : "ABNORMAL"));
    return this.get_co2_detected();
  }
  /**
   * Handle requests to get the current value of the "Carbon Dioxide Detected" characteristic
   */
  handleCarbonDioxideLevelGet() {
    this.log.info('Triggered GET CarbonDioxideLevel');
    this.log.info("Current state of the CO2 sensor CO2Level was returned: " + (this.sensorData.eco2));
    return this.sensorData.eco2;
  }

  handleAirQualityGet() {
    this.log.debug('Triggered GET AirQuality');
    this.log.debug("Current state of the AirQuality sensor was returned: " + (this.sensorData.eco2));

   if(this.sensorData.aqi == 1) {
      return hap.Characteristic.AirQuality.EXCELLENT;
    } else if(this.sensorData.aqi == 2) {
      return hap.Characteristic.AirQuality.GOOD;
    } else if(this.sensorData.aqi == 3) {
      return hap.Characteristic.AirQuality.FAIR;
    } else if(this.sensorData.aqi == 4) {
      return hap.Characteristic.AirQuality.INFERIOR;
    } else if(this.sensorData.aqi >= 5) {
      return hap.Characteristic.AirQuality.POOR;
    }
    return hap.Characteristic.AirQuality.UNKNOWN;
  }

  handleVOCGet() {
    this.log.debug('Triggered GET VOCDensity');
    this.log.debug("Current state of the VOC sensor VOCDensity was returned: " + (this.sensorData.tvoc));
    return this.sensorData.tvoc;
  }

  handleCurrentTemperatureGet() {
    this.log.debug('Triggered GET CurrentTemperature');
    this.log.debug("Current state of the Temperature sensor CurrentTemperature was returned: " + (this.sensorData.temperature));
    return this.sensorData.temperature;
  }

  handleCurrentRelativeHumidityGet() {
    this.log.debug('Triggered GET CurrentRelativeHumidity');
    this.log.debug("Current state of the Humidity sensor CurrentRelativeHumidity was returned: " + (this.sensorData.humidity));
    return this.sensorData.humidity;
  }


  update_device_values() {
    this.co2Service.getCharacteristic(hap.Characteristic.CarbonDioxideDetected).updateValue
  }

  update_from_http_request(callback: (error: Error | null, result: boolean) => void) {
    this.log.info('Triggered Update from HTTP Request, url = ' + this.url);

    try {
      let req = http.get(this.url, res => {
        let recv_data = '';
        res.on('data', chunk => { recv_data += chunk });
        res.on('end', () => {
          // recv_data contains volume info.
          let json_values: SensorData = JSON.parse(recv_data);
          this.sensorData = json_values;
          this.log.info("Updated sensor data: " + JSON.stringify(this.sensorData));
          callback(null, true);
        });
      });
      req.on('error', err => {
        this.log("Error in update_from_http_request: " + err.message);
      })



    } catch (error) {
      this.log.error("Error while updating data from http request: " + error);
    }
  }
  poll() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    // volume update from Sonos
    this.update_from_http_request((err, result) => {
      this.update_device_values();
    });
    this.log.debug("Polling again in " + this.pollingInterval + " ms");
    this.timer = setTimeout(this.poll.bind(this), this.pollingInterval)
  }
  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!");
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.co2Service,
      this.airQualityService,
      this.temperatureService,
      this.humidityService,
    ];
  }

}