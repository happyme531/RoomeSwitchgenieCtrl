//RoomeBLE: Tools to control the Roome BLE switch.
//This program is built to cooperate with node-red, but the interconnection is not very beautiful. 
//这个程序是和node-red配合的，但是整合方式并不是很完美。

//Usage:
// node main.js --list-adaptors
// -> List all available bluetooth adapters

// node main.js --scan
// -> Scan for devices
// node main.js --device-mac=<mac> --query-status
// -> print the status of the switch as
//    {
//      "switch0": "on",
//      "switch1": "off",
//      "switch2": "off",
//    }

// node main.js --device-mac=<mac> --switch-on=<switch-id>
// -> switch on the switch with id <switch-id>, id can be 0, 1 or 2
// node main.js --device-mac=<mac> --switch-off=<switch-id>
// -> switch off the switch with id <switch-id>, id can be 0, 1 or 2

// Common options:
// --adaptor=<adaptor> -> specify the bluetooth adaptor to use, leave empty to use the default adaptor.  Use --list-adaptors to list all available adaptors.

//Change the current working directory to the directory of the script.
process.chdir(__dirname);

//Using the node-ble library to communicate with the BLE device.
const {createBluetooth} = require('node-ble');
const {bluetooth, destroy} = createBluetooth();

const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

//sleep 
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debugPrintToStderr(str) {
  process.stderr.write(str + "\n");
}

let listAdaptors = async function() {
    var adapters = await bluetooth.adapters();
    debugPrintToStderr(adapters);
    return;
}

async function getAdapter(name) {
    //if name is not specified, use the default adaptor.
    if (name == undefined) {
        var adapter = await bluetooth.defaultAdapter();
        return adapter;
    }
   
    var adapter = await bluetooth.getAdapter(name);
    return adapter;
}

var adapter= null;

async function scan() {
    //scan is actrually "discover"
    adapter.startDiscovery();
    //Scan for 20 seconds.
    debugPrintToStderr("Scanning for devices...");
    await sleep(20000);
    debugPrintToStderr("Scanning finished.");
    //print the list of devices.
    var devices = await adapter.devices();
    for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        debugPrintToStderr(device);
    }
}


async function connectToDevice(deviceMac) {
  //connect to the device.
  if (! await adapter.isDiscovering())
    await adapter.startDiscovery()
  debugPrintToStderr("Connecting to the device...");

  var device = await adapter.waitDevice(deviceMac);
  if (!await device.isPaired()) {
    debugPrintToStderr("Device is not paired. Pairing...");
    try {
      await device.pair();
    } catch (e) {
      //print the error message.
      debugPrintToStderr(e);
      debugPrintToStderr("Pairing failed.");
      debugPrintToStderr("Try to use bluetoothctl to pair the device.");
      return;
    }
    debugPrintToStderr("Pairing finished.");
  }
  if (!await device.isConnected()) {
    debugPrintToStderr("Connecting to the device...");
    await device.connect();
    debugPrintToStderr("Connected.");
  }
  //Stop the discovery if it is still running.
  if(await adapter.isDiscovering())
    await adapter.stopDiscovery();
  return device;
}

//Change switch status.
//The format of the data sent to the device is:
//01 40 01 xx 01 yy
//xx: the action, 01 means switch on, 00 means switch off.
//yy: the switch id, 00 means switch 0, 01 means switch 1, 02 means switch 2.
async function switchOn(deviceMac, switchId) {
  debugPrintToStderr("Switching on the switch with id " + switchId);
  //this function could throw error, so try to connect to the device for 4 times. If the connection succeeds, then break the loop.
  for (var i = 0; i < 4; i++) {
    try {
      var device = await connectToDevice(deviceMac);
      break;
    } catch (e) {
      debugPrintToStderr(e);
      debugPrintToStderr("Connection failed. Retrying..." + i);
    }
  }

  let gatt = await device.gatt();
  let service = await gatt.getPrimaryService(SERVICE_UUID);
  //get the characteristic.
  var characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
  //set the value of the characteristic.
  var value = new Buffer([0x01, 0x40, 0x01, 0x01, 0x01, switchId]);
  await characteristic.writeValue(value);
  //disconnect from the device.
  await device.disconnect();
  destroy()
}

async function switchOff(deviceMac, switchId) {
  debugPrintToStderr("Switching off the switch with id " + switchId);
    //this function could throw error, so try to connect to the device for 4 times. If the connection succeeds, then break the loop.
    for (var i = 0; i < 4; i++) {
      try {
        var device = await connectToDevice(deviceMac);
        break;
      } catch (e) {
        debugPrintToStderr(e);
        debugPrintToStderr("Connection failed. Retrying..." + i);
      }
    }
  let gatt = await device.gatt();
  let service = await gatt.getPrimaryService(SERVICE_UUID);
  //get the characteristic.
  var characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
  //set the value of the characteristic.
  var value = new Buffer([0x01, 0x40, 0x01, 0x00, 0x01, switchId]);
  await characteristic.writeValue(value);
  //disconnect from the device.
  await device.disconnect();
  destroy()
}


async function main() {

  var argv = require('minimist')(process.argv.slice(2));
  var deviceMac = argv['device-mac'];
  var queryStatus = argv['query-status'];
  var switchOnIndex = argv['switch-on'];
  var switchOffIndex = argv['switch-off'];
  var doScan = argv['scan'];
  var customadaptor = argv['adaptor'];

  if (argv['list-adaptors']) {
    listAdaptors();
    return;
  }
  
  if(customadaptor) {
    adapter = await getAdapter(customadaptor);
  } else {
    adapter = await getAdapter();
  }

  //check if the adaptor is powered on.
  if (!await adapter.isPowered()) {
    debugPrintToStderr("Please power on the adaptor.");
    return;
  }

  if (doScan) {
    scan();
    return;
  }



  if (deviceMac === undefined) {
    debugPrintToStderr('Please specify the device mac address as --device-mac=<mac>');
    return;
  }

  if (queryStatus) {
    queryStatus(deviceMac);
  } else if (switchOnIndex !== undefined) {
    switchOn(deviceMac, switchOnIndex);
  } else if (switchOffIndex !== undefined) {
    switchOff(deviceMac, switchOffIndex);
  } else {
    debugPrintToStderr('Please specify the action as --query-status or --switch-on=<switch-id> or --switch-off=<switch-id>');
  }
}

main();