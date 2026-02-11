/*
Copyright 2024 Open Foodservice System Consortium

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Receipt } from "./receipt.js";

// QR Code is a registered trademark of DENSO WAVE INCORPORATED.

export const ReceiptUsb = (() => {
  //
  // event dispatcher
  //
  const dispatch = (listener, ...args) => {
    setTimeout(() => {
      for (let callback of listener) callback(...args);
    });
  };

  //
  // usb device
  //
  const usbdevice = () => {
    let device;
    let opened = false;
    let ifaceNumber = null;
    let endpointOut = null;
    const listeners = { open: [], error: [], close: [] };

    const findInterface = () => {
      for (const cfg of device.configurations) {
        for (const iface of cfg.interfaces) {
          for (const alt of iface.alternates) {
            if (
              alt.endpoints &&
              alt.endpoints.some((ep) => ep.direction === "out")
            ) {
              return {
                configurationValue: cfg.configurationValue,
                interfaceNumber: iface.interfaceNumber,
                alternateSetting: alt.alternateSetting,
                endpointOut: alt.endpoints.find((ep) => ep.direction === "out")
                  .endpointNumber,
              };
            }
          }
        }
      }
      return null;
    };

    return {
      async open(filters) {
        try {
          device = await navigator.usb.requestDevice({
            filters: filters && filters.length ? filters : [],
          });
          await device.open();
          const iface = findInterface();
          if (!iface) {
            throw new Error("No USB OUT endpoint found.");
          }
          if (device.configuration?.configurationValue !== iface.configurationValue) {
            await device.selectConfiguration(iface.configurationValue);
          }
          ifaceNumber = iface.interfaceNumber;
          endpointOut = iface.endpointOut;
          await device.claimInterface(ifaceNumber);
          if (iface.alternateSetting) {
            await device.selectAlternateInterface(
              ifaceNumber,
              iface.alternateSetting,
            );
          }
          opened = true;
          dispatch(listeners.open);
        } catch (e) {
          dispatch(listeners.error, e);
          dispatch(listeners.close);
        }
      },
      async write(data) {
        if (!opened || !device) return false;
        const buffer =
          data instanceof Uint8Array ? data : Uint8Array.from(data, (c) => c.charCodeAt(0));
        try {
          await device.transferOut(endpointOut, buffer);
          return true;
        } catch (e) {
          dispatch(listeners.error, e);
          return false;
        }
      },
      async close() {
        if (!device) return;
        try {
          if (ifaceNumber !== null) {
            await device.releaseInterface(ifaceNumber);
          }
          await device.close();
        } finally {
          opened = false;
          device = null;
          ifaceNumber = null;
          endpointOut = null;
          dispatch(listeners.close);
        }
      },
      on(event, callback) {
        if (listeners[event]) {
          listeners[event].push(callback);
        }
      },
    };
  };

  //
  // controller
  //
  return {
    connect(filters) {
      const usb = usbdevice();
      const listeners = { open: [], error: [], close: [] };

      const conn = {
        on(event, callback) {
          if (listeners[event]) {
            listeners[event].push(callback);
          }
        },
        async print(markdown, options) {
          const receipt = Receipt.from(markdown, options);
          const command = await receipt.toCommand();
          const data = new Uint8Array(command.length);
          for (let i = 0; i < command.length; i++) {
            data[i] = command.charCodeAt(i) & 0xff;
          }
          return usb.write(data);
        },
        close() {
          return usb.close();
        },
      };

      usb.on("open", () => dispatch(listeners.open));
      usb.on("error", (e) => dispatch(listeners.error, e));
      usb.on("close", () => dispatch(listeners.close));
      usb.open(filters);

      return conn;
    },
  };
})();
