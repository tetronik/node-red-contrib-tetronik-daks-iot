# Changelog

## 1.0.0 (first public release)
* **ESPA-X**
  * Fixed queue qantity value to actual fill value in percent
  * Added queue size as item count
* **ESPA-X Process**
  * Changed label "Call-Number" to "Phone-Number", function unchanged
  * Changed labels "Caller-*" to "Calling-*"
  * Changed "Delay" maximum to 999
  * Changed "Attempts" maxmimum to 20
  * Changed "Group-ID" to maximum of 4 characters
  * Changed "ID of the callback interface" to maximum of 3 characters
  * Removed characters " ,;. " from phone number input fields
  * Fixed max queue size
* **ESPA-X Server config**
  * Changed default "Timeout / Heartbeat" for new nodes to 55 seconds
  * Changed multiple input fields from "Master-Server" to REQUIRED via HTML
  * Added note in nodes help about connection parameters
  * Fixed process on response code "406" (Not Acceptable) and "409" (Conflict) to be able to send an unhandled process to a backup server
  * Fixed error on duplicated process
* **Process Evaluation**
  * Fixed possible output values for "endReason" and "result" in node help text
* **Central Logging**
  * Changed label "Connector" to "Log-Connector", function unchanged
* **Custom Central Logging Input**
  * Changed label "Connector" to "Log-Connector", function unchanged
* **Compatibility**
  * Added minimum Node-RED support version >= 2.0.0

## 0.9.1-beta
Beta release:
* Readme-Update

## 0.9.0-beta
Beta release:
* **Implemented Nodes**
  * Central Logging
  * Custom Central Logging Input
  * ESPA-X
  * ESPA-X Process
  * Process Evaluation
  * Event ID
  * Sting to Array \w Filter
  * *t-daks espax-server*
  * *t-daks log-connector*
  * *t-daks event-id_definition*