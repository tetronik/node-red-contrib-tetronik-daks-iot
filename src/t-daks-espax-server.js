"use strict";

const { notEqual } = require('assert');

/**
 * 
 * Copyright (c) tetronik GmbH (https://tetronik.com)
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 */

module.exports = function(RED) {

	var xml2js = require('xml2js');
	var CronJob = require("cron").CronJob;

	var xmlBuilder = new xml2js.Builder();
	var uespaxClient = createUespaxIpcClient();

	function normalizeSatelliteKey(value) {
		return ["off", "1", "#", "no-input"].indexOf(String(value || "off")) >= 0
			? String(value || "off")
			: "off";
	}

	function createUespaxIpcClient() {
		var fs = require("fs");
		var net = require("net");
		var socketFile = process.env.WEBCONFIG_UESPAX_SOCKET_FILE || "/var/run/t_uespax_auth.sock";

		function isAvailable() {
			return fs.existsSync(socketFile);
		}

		function request(payload, callback) {
			var socket = net.createConnection(socketFile);
			var response = "";
			var isDone = false;
			var timeout = setTimeout(function() {
				finish(new Error("uESPA-X IPC request timed out."));
			}, 2000);

			function finish(error, result) {
				if(isDone) {
					return;
				}

				isDone = true;
				clearTimeout(timeout);
				socket.destroy();
				callback(error, result);
			}

			socket.setEncoding("utf8");
			socket.on("connect", function() {
				socket.write(JSON.stringify(payload) + "\n");
			});
			socket.on("data", function(chunk) {
				response += chunk;

				if(response.indexOf("\n") === -1) {
					return;
				}

				try {
					finish(null, JSON.parse(response.split("\n")[0]));
				} catch(err) {
					finish(err);
				}
			});
			socket.on("error", finish);
		}

		return {
			createConnection: function(config, nodeId, connectionId, packageVersion) {
				return {
					createInitialLogin: function(invokeID, callback) {
						request({
							action: "initialLogin",
							config: config,
							connectionId: connectionId,
							invokeID: invokeID,
							nodeId: nodeId,
							packageVersion: packageVersion
						}, callback);
					},
					handleLoginResponse: function(params, rspCode, nextInvokeID, callback) {
						request({
							action: "handleLoginResponse",
							config: config,
							connectionId: connectionId,
							nextInvokeID: nextInvokeID,
							nodeId: nodeId,
							packageVersion: packageVersion,
							params: params,
							rspCode: rspCode
						}, callback);
					},
					sendInputStatus: function(payload, callback) {
						request({
							action: "inputStatus",
							connectionId: connectionId,
							nodeId: nodeId,
							payload: payload
						}, callback);
					},
					parseOutputStatus: function(params, callback) {
						request({
							action: "outputStatus",
							connectionId: connectionId,
							nodeId: nodeId,
							params: params
						}, callback);
					},
					setConnectionState: function(active, callback) {
						request({
							action: "connectionState",
							active: active === true,
							connectionId: connectionId,
							nodeId: nodeId
						}, callback || function() {});
					}
				};
			},
			getLicenseState: function(callback) {
				if(!isAvailable()) {
					callback(null, {
						ok: false,
						message: "uESPA-X IPC socket is not available."
					});
					return;
				}

				request({
					action: "licenseState"
				}, callback);
			},
			isAvailable: isAvailable,
			releaseNode: function(nodeId) {
				if(!isAvailable()) {
					return;
				}

				request({
					action: "release",
					nodeId: nodeId
				}, function() {});
			}
		};
	}

	if(RED.httpAdmin) {
		var needsReadPermission = RED.auth && RED.auth.needsPermission
			? RED.auth.needsPermission("flows.read")
			: function(req, res, next) { next(); };

		RED.httpAdmin.get("/tetronik-daks-iot/uespax-license", needsReadPermission, function(req, res) {
			uespaxClient.getLicenseState(function(error, result) {
				if(error || !result || !result.ok) {
					res.json({
						enabled: false,
						maxConnections: 0,
						availableConnections: 0,
						reservedConnections: 0,
						reason: error ? error.message : (result && result.message ? result.message : "uESPA-X status is unavailable.")
					});
					return;
				}

				res.json(result.state);
			});
		});
	}

	/// CLASS
	/*
	 * RemoteServer
	 */
	function DaksEspaxServerNode(n) {
		RED.nodes.createNode(this,n);

		var net_1 = require('net'), net_2 = require('net');
		var tls_1 = require('tls'), tls_2 = require('tls');

		// common
		this.max_queuesize = (n.max_queuesize < 10 || n.max_queuesize > 10000)? 1000 : n.max_queuesize; // in theory "(2^32)-1" items to ECMA-262-5 specification with uInt32
		this.queuesize_warning = (n.queuesize_warning < 10 || n.queuesize_warning > 100)? 80 : n.queuesize_warning;
		this.name = n.name;
		this.logging = RED.nodes.getNode(n.logging);
		this.use_uespax = n.use_uespax === true || n.use_uespax === "true";
		// Satellite ESPA4.4.4 behaviour is configured centrally on the
		// uESPA-X connector and sent to DAKS after a successful login.
		this.keypad_echo = n.keypad_echo === true || n.keypad_echo === "true";
		this.extended_status = n.extended_status === true || n.extended_status === "true";
		this.one_evaluation = n.one_evaluation === true || n.one_evaluation === "true";
		this.one_disconnects = n.one_disconnects === true || n.one_disconnects === "true";
		this.hash_evaluation = n.hash_evaluation === true || n.hash_evaluation === "true";
		this.hash_disconnects = n.hash_disconnects === true || n.hash_disconnects === "true";
		this.key_prioritize = normalizeSatelliteKey(n.key_prioritize);
		this.key_note = normalizeSatelliteKey(n.key_note);
		this.key_stop = normalizeSatelliteKey(n.key_stop);
		// master
		this.name_main = removeUTF8Ctrls(n.name_main);
		this.host_main = removeUTF8Ctrls(n.host_main);
		this.port_main = n.port_main;
		this.usessl_main = n.usessl_main;
		this.validate_certificate_main = n.validate_certificate_main;
		this.user_main = removeUTF8Ctrls(n.user_main);
		this.password_main = removeUTF8Ctrls(n.password_main);
		this.client_main = removeUTF8Ctrls(n.client_main);
		this.timeout_main = (n.timeout_main < 1 || n.timeout_main > 299)? 55 : n.timeout_main;
		// slave
		this.have_slave = n.have_slave;
		this.name_slave = removeUTF8Ctrls(n.name_slave);
		this.host_slave = removeUTF8Ctrls(n.host_slave);
		this.port_slave = n.port_slave;
		this.usessl_slave = n.usessl_slave;
		this.validate_certificate_slave = n.validate_certificate_slave;
		this.user_slave = removeUTF8Ctrls(n.user_slave);
		this.password_slave = removeUTF8Ctrls(n.password_slave);
		this.client_slave = removeUTF8Ctrls(n.client_slave);
		this.timeout_slave = (n.timeout_slave < 1 || n.timeout_slave > 299)? 55 : n.timeout_slave;

		// version string build
		var nPackage = require('../package.json');
		var nVersion = nPackage.version;	// get version from this NodePackage
		var sVersion = "DAKS-IoT_V"+nVersion;

		// system vars
		var node = this;
		var job = null;
		node.uespaxClient = null;
		node.uespaxNodeId = node.id || n.id || node.name;
		node.lastNodeStatus = {};
		node.login_failed = [false, false];
		node.queue = [];	// Process Queue
		node.max_age = 1;	// in minutes
		node.socketErrorMessage = false;
		node.context.state = 0;	//Server states for client handling and state message in NodeRed

		updateFile(node, true);	// read old queue data from file

		if(node.use_uespax) {
			// Keep the IPC client even while its Unix socket is still starting.
			// Each ESPA-X connection waits and retries until WebConfiguration has
			// published the socket; it must never fall back to legacy ESPA-X.
			node.uespaxClient = uespaxClient;
		}

		// define and start CRON-Job for background queue handling
		try {
            // run cron every second
            job = new CronJob("*/5 * * * * *", function() {
				handleQueueData(node);
            });

            setTimeout(function() {
            }, 500);
            job.start();

        } catch(err) {
			node.debug({payload: "Error-Code: 2956165a", err: err, msg: 'ERROR'});
            tLog(node, err, 'ERROR');
        }
	
		// setup master and slave config objects
		var configMain = {ip: this.host_main, port: this.port_main, usessl: this.usessl_main, validate_certificate: this.validate_certificate_main, user: this.user_main, pwd: this.password_main, client: this.client_main, sw: sVersion, name: this.name_main, use_uespax: node.use_uespax, packageVersion: nVersion, nodeId: node.uespaxNodeId, connectionId: node.uespaxNodeId + ":main"};
		var configSlave = {ip: this.host_slave, port: this.port_slave, usessl: this.usessl_slave, validate_certificate: this.validate_certificate_slave, user: this.user_slave, pwd: this.password_slave, client: this.client_slave, sw: sVersion, name: this.name_slave, use_uespax: node.use_uespax, packageVersion: nVersion, nodeId: node.uespaxNodeId, connectionId: node.uespaxNodeId + ":slave"};

		// define master and slave connections
		node.hotStandBy = 0;
		// A TCP connection alone is not enough for uESPA-X contact indications.
		// Until S-HOTSTBY has been received, treat the peer as inactive so that
		// no contact state is accidentally sent to a standby DAKS.
		node.hotStandBy_master_active = false;
		node.hotStandBy_slave_active = false;
		node.uespaxInputSnapshot = null;
			node.uespaxInputSnapshotPending = false;
			node.uespaxInputSnapshotInFlight = false;
			node.uespaxInputSnapshotBlocked = false;
			node.hotStandbyWarningTimer = null;
			node.updateHotStandbyState = updateHotStandbyState;
			node.markDaksConnectionInactive = markDaksConnectionInactive;
		node.connection = {};
		node.connection[0] = new EspaXConnection(node, configMain, true, net_1, tls_1);	// predefine an espa-x MAIN connection
		// only define slave if defined
		if(this.have_slave == "slave") {
			node.connection[1] = new EspaXConnection(node, configSlave, false, net_2, tls_2);	// predefine an espa-x SLAVE connection
		}

		// Consumers such as the ESPA4.4.4 bridge must distinguish an open TCP
		// socket from a DAKS that is actually responsible for processing calls.
			node.hasActiveEspaxConnection = function() {
				return getPreferredActiveConnection(node) !== null;
			};
			node.getConnectionStatus = function() {
				return getEspaxConnectionStatus(node);
			};

		updateNodeStatus(node, "yellow", "dot", "Start connection...");
		
		// start master and slave connection
		node.connection[0].start();	// start MAIN connection
		// only start slave if defined
		if(this.have_slave == "slave") {
			node.connection[1].start();	// start SLAVE connection
		}
		
		/// EVENT-LISTENER
		/*
		 * Get last node status for new node
		 */
		node.addListener('getLastStatus', function(parentNode) {
			var msg = node.lastNodeStatus;
			msg.node = parentNode;
			node.emit('InitNodestatus', msg);
		});
		
		/// EVENT-LISTENER
		/*
		 * Flush Queue (File and Program)
		 */
		node.addListener('FlushQueue', function(msg) {
			node.queue = [];
			updateFile(node);
		});

		/*
		 * Digital input states are deliberately interpreted by the WebConfig
		 * uESPA-X service. The Node-RED module only forwards the JSON payload.
		 */
		function isSelectedDaksActive() {
			return node.hotStandBy === 0
				? node.hotStandBy_master_active === true
				: node.hotStandBy_slave_active === true;
		}

		function sendPendingUespaxInputStatus() {
			var connection = node.connection[node.hotStandBy];

			if(node.uespaxInputSnapshotBlocked || !node.uespaxInputSnapshotPending || !node.uespaxInputSnapshot ||
				node.uespaxInputSnapshotInFlight || !isSelectedDaksActive() ||
				!connection || !connection.getConnectionState()) {
				return;
			}

			node.uespaxInputSnapshotPending = false;
			node.uespaxInputSnapshotInFlight = true;
			connection.sendUespaxInputStatus(node.uespaxInputSnapshot, function(error, result) {
				node.uespaxInputSnapshotInFlight = false;
				if((error || !result || !result.ok) && !node.uespaxInputSnapshotBlocked) {
					node.uespaxInputSnapshotPending = true;
					var message = error ? error.message : (result && result.message ? result.message : "uESPA-X digital I/O input was rejected.");
					tLog(node, message, 'WARNING');
					node.emit('Nodeoutput', [null, {payload: message, level: 'WARNING'}]);
				}
				sendPendingUespaxInputStatus();
			});
		}

		function updateHotStandbyState(master, hotstby) {
			var wasSelectedDaksActive = isSelectedDaksActive();
			var hotStandbyValue = Array.isArray(hotstby) ? hotstby[0] : hotstby;
			var isActive = String(hotStandbyValue || "").toLowerCase() === "false";

			if(master) {
				node.hotStandBy_master_active = isActive;
			} else {
				node.hotStandBy_slave_active = isActive;
			}

				updateHotStandbyWarning();

			changeNodeState_Connection(node);

			// A promotion needs an immediate full contact-state reconciliation,
			// even if no input changed while the DAKS was in Hot-Standby.
			if(!wasSelectedDaksActive && isSelectedDaksActive() && node.uespaxInputSnapshot) {
				node.uespaxInputSnapshotPending = true;
				sendPendingUespaxInputStatus();
			}
		}

			function markDaksConnectionInactive(master) {
			if(master) {
				node.hotStandBy_master_active = false;
			} else {
				node.hotStandBy_slave_active = false;
			}
				changeNodeState_Connection(node);
			}

			function updateHotStandbyWarning() {
				if(node.hotStandbyWarningTimer) {
					clearTimeout(node.hotStandbyWarningTimer);
					node.hotStandbyWarningTimer = null;
				}

				if(node.have_slave != "slave" || node.hotStandBy_master_active || node.hotStandBy_slave_active) {
					return;
				}

				// DAKS reports the two sides of a handover independently. Wait briefly
				// before declaring both peers standby, otherwise the normal transition
				// from primary to secondary produces a false critical warning.
				node.hotStandbyWarningTimer = setTimeout(function() {
					node.hotStandbyWarningTimer = null;
					if(!node.hotStandBy_master_active && !node.hotStandBy_slave_active) {
						tLog(node, "Both DAKS-Servers are in Hot-Standby mode.", 'CRITICAL');
						node.warn("Both DAKS-Servers are in Hot-Standby mode.");
					}
				}, 1_000);
			}

		node.addListener('UespaxInputStatus', function(payload) {
			// t-daks-uespax-in emits a complete selected-contact snapshot. Keep the
			// newest version while the selected DAKS is in Hot-Standby and replay it
			// once that DAKS becomes active.
			node.uespaxInputSnapshotBlocked = false;
			node.uespaxInputSnapshot = payload;
			node.uespaxInputSnapshotPending = true;
			sendPendingUespaxInputStatus();
		});

		node.addListener('UespaxInputStatusBlocked', function() {
			// An IOG configuration error means that the previously collected
			// contact data is no longer trustworthy. Drop it instead of replaying
			// it after a retry or a Hot-Standby promotion. A request already handed
			// to the transport cannot be cancelled, but it will not be retried.
			node.uespaxInputSnapshotBlocked = true;
			node.uespaxInputSnapshot = null;
			node.uespaxInputSnapshotPending = false;
		});

		/// EVENT-LISTENER
		/*
		 * Input data for the queue
		 */
		node.addListener('MessageToQueue', function(msg) {

			var activeConnection = getPreferredActiveConnection(node);
			if(activeConnection !== null) {
				msg.used_connection = activeConnection;
			} else if(!msg.again) {
				msg.used_connection = node.hotStandBy;
			}

			// get new invoke id
			var invokeID = "";
			try{
				invokeID = node.connection[msg.used_connection].getInvokeID();
			} catch(err){
				node.debug({payload: "Error-Code: ec13bc36", err: err, msg: msg});
				return;
			}
			
			msg.invokeid = invokeID;
			if(typeof msg.timestamp == 'undefined') {
				msg.timestamp = Date.now();
			}

			try {
				if(!msg.again) {
					if(!Array.isArray(node.queue)) {
						node.queue= [];
					}
	
					msg.send_confirmed = false;
	
					if(!checkDouble(node, msg)) {
						// push message to process queue
						msg.max_age = (msg.max_age != undefined)? msg.max_age : node.max_age;
						if(node.queue.length < node.max_queuesize) {
							node.queue.push(msg);
						} else {
							tLog(node, "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, 'ALARM');
							node.error("The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid);
							node.emit('Nodeoutput', [null, {payload: "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, level: 'ALARM'}]);
							return;
						}
					} else {
						tLog(node, "The sent message is already in the queue. Request: " + msg.uniqid, 'WARNING');
						node.debug("Already in QUEUE!");
						return;
					}
	
					// check queue size
					if((100 / node.max_queuesize * node.queue.length) >= node.queuesize_warning) {
						node.emit('Nodeoutput', [null, {payload: "Warning: Your Queue reached the warning level of " + node.queuesize_warning + "% .", level: 'WARNING', quantity: (100 / node.max_queuesize * node.queue.length), items: node.queue.length}]);
					}
				}
			} catch(err) {
				node.debug({payload: "Error-Code: 85a8aed5", err: err, msg: msg});
			}

			// Do not submit a process to a TCP-connected DAKS while it is in
			// Hot-Standby. Keep the item in the local queue until either the
			// primary or secondary DAKS has explicitly become active.
			activeConnection = getPreferredActiveConnection(node);
			if(activeConnection === null) {
				updateFile(node);
				return;
			}
			msg.used_connection = activeConnection;

			// get current session id
			var sid;
			try {
				sid = node.connection[msg.used_connection].getSessionID();
			} catch(err) {
				node.debug({payload: "Error-Code: 738a2fb0", err: err, msg: msg});
				return;
			}

			// define special variables
			msg.espax.phone_number = "";
			msg.espax.call_id = "";

			// set special variables for ESPA-X with pre-defined general variable
			try {
				if(msg.espax.type == "single") {
					msg.espax.phone_number = msg.espax.number
				} else if(msg.espax.type == "group") {
					msg.espax.call_id = msg.espax.number;
				}
			} catch(err) {
				node.debug({payload: "Error-Code: c39270f1", err: err, msg: msg});
			}

			var confirmation = "";
			if(msg.confirmation != undefined) {
				confirmation = { 
					'KEY_0': { $: {title: removeUTF8Ctrls(msg.confirmation.l[0])}, _: msg.confirmation.k[0] || "None"},
					'KEY_1': { $: {title: removeUTF8Ctrls(msg.confirmation.l[1])}, _: msg.confirmation.k[1] || "None"},
					'KEY_2': { $: {title: removeUTF8Ctrls(msg.confirmation.l[2])}, _: msg.confirmation.k[2] || "None"},
					'KEY_3': { $: {title: removeUTF8Ctrls(msg.confirmation.l[3])}, _: msg.confirmation.k[3] || "None"},
					'KEY_4': { $: {title: removeUTF8Ctrls(msg.confirmation.l[4])}, _: msg.confirmation.k[4] || "None"},
					'KEY_5': { $: {title: removeUTF8Ctrls(msg.confirmation.l[5])}, _: msg.confirmation.k[5] || "None"},
					'KEY_6': { $: {title: removeUTF8Ctrls(msg.confirmation.l[6])}, _: msg.confirmation.k[6] || "None"},
					'KEY_7': { $: {title: removeUTF8Ctrls(msg.confirmation.l[7])}, _: msg.confirmation.k[7] || "None"},
					'KEY_8': { $: {title: removeUTF8Ctrls(msg.confirmation.l[8])}, _: msg.confirmation.k[8] || "None"},
					'KEY_9': { $: {title: removeUTF8Ctrls(msg.confirmation.l[9])}, _: msg.confirmation.k[9] || "None"},
					'CFRM_ANN': removeUTF8Ctrls(msg.confirmation.ann) || "",
					'CFRM_TEXT': removeUTF8Ctrls(msg.confirmation.text) || ""
				};
			}

			// build XML for single and group calls
            var xml = {
                'ESPA-X' : { $: { version:"1.00", xmlns: "http://ns.espa-x.org/espa-x", 'xmlns:xsi': "http://www.w3.org/2001/XMLSchema-instance", 'xsi:schemaLocation': "http://ns.espa-x.org/espa-x http://schema.espa-x.org/espa-x100.xsd",timestamp:(new Date()).toISOString().replace(/\..+/, '')},
                    'REQ.P-START': { $: {invokeID:msg.invokeid, sessionID:sid},
                        'CP-PR-REF': msg.uniqid,
						'CP-PHONENO': removeUTF8Ctrls(msg.espax.phone_number),
						'CP-GROUPID': removeUTF8Ctrls(msg.espax.call_id),
                        'CP-CALLINGNO': removeUTF8Ctrls(msg.espax.calling_number),
						'CP-CALLINGNAME': removeUTF8Ctrls(msg.espax.calling_name),
						'CP-TEXTMSG': removeUTF8Ctrls(msg.espax.message),
						'CP-WARD': removeUTF8Ctrls(msg.espax.ward),
						'CP-BED': removeUTF8Ctrls(msg.espax.bed),
						'CP-SIGNAL': msg.espax.signal,
						'CP-CALLBACK': removeUTF8Ctrls(msg.espax.callback),
						'CP-DELAY': msg.espax.delay,
						'CP-ATTEMPTS': msg.espax.attempts,
						'CP-PRIO': msg.espax.prio,
						'CP-CBCKNO': msg.espax.cbckno,
						'CP-NCIFNO': msg.espax.ncifno,
						'CP-PR-DETAILS': msg.espax.pr_details,
						'PROPRIETARY': { 
							'DAKS_ESPA-X': { $: {version: "1.14", xmlns:"http://ns.tetronik.com/DAKS_ESPA-X", 'xmlns:xsi': "http://www.w3.org/2001/XMLSchema-instance", 'xsi:schemaLocation':"http://ns.tetronik.com/DAKS_ESPA-X http://schema.tetronik.com/DAKS/DAKS_ESPA-X114.xsd"},
								'START1': {
									'SA-ANNIDS': removeUTF8Ctrls(msg.espax.audio_id),
									'CONFIRMATION': confirmation,
									'SGL_CONNTYPE': removeUTF8Ctrls(msg.espax.conntype)
								}
							}
						}
                    }
                }
			};

			try {
				node.connection[msg.used_connection].sendRequest(invokeID, xml);
			} catch(err) {
				node.debug({payload: "Error-Code: 7df4f2de", err: err, msg: xml});
			}
			updateFile(node);
		});
		
		/// EVENT-LISTENER
		/*
		 * Command for Processes
		 */
		node.addListener('Command', function(msg) {
			if(!msg.again) {
				if(!Array.isArray(node.queue)) {
					node.queue= [];
				}
			}

			var sid;
			try {
				if(typeof msg.used_connection == 'undefined') {
					var tl = node.queue.length;
					var noInput = true;
					for(var i = 0; i<tl; i++) {
						if(typeof msg.event_id == 'string' && typeof node.queue[i].event_id == 'string') {
								// "normal" event_id
								if(msg.event_id == node.queue[i].event_id) {
									msg.used_connection = node.queue[i].used_connection;
									noInput = false;
									break;
								}
						} else if(typeof msg.event_id == 'object' && typeof node.queue[i].event_id == 'object') {
							// "customized" event_id
							if(msg.event_id.id == node.queue[i].event_id.id) {
								if(msg.event_id.custom.length == node.queue[i].event_id.custom.length) {
									var notEqual = false;
									for(var c = 0; c<msg.event_id.custom.length; c++) {
										if(typeof node.queue[i].event_id.custom[c] == 'undefined') {
											// return not doubled
											notEqual = true;
											break;
										} else if(node.queue[i].event_id.custom[c] == msg.event_id.custom[c]) {
											// do nothing because of check algorithm
										} else {
											// return not doubled
											notEqual = true;
											break;
										}
									}
									
									if(!notEqual) {
										// return doubled
										msg.used_connection = node.queue[i].used_connection;
										noInput = false;
										break;
									}
								}
							}
						}
					}
					if(noInput) {
						tLog(node, "The sent message cannot be mapped to a process. Request: " + msg.uniqid, 'WARNING');
						node.debug("Process is unknown!");
						return;
					}
				}
			} catch(err) {
				node.debug({payload: "Error-Code: 505a4ebf", err: err, msg: msg});
			}
			
			// get current session id
			try {
				sid = node.connection[msg.used_connection].getSessionID();
			} catch(err) {
				node.debug({payload: "Error-Code: 07a6b5ce", err: err, msg: msg});
				return;
			}

			var xml;

			// send logout request to server (standard action on flow/node stop/restart)
			if(msg.cmd == "logout") {
				if(!msg.again) {
					var invokeID = node.connection[msg.used_connection].getInvokeID();
					msg.invokeid = invokeID;

					if(!checkDouble(node, msg)) {
						// push message to process queue
						msg.timestamp = Date.now();
						msg.used_connection = node.hotStandBy;
						/*if(node.queue.length < node.max_queuesize) {*/
							node.queue.push(msg);
						/*} else {
							tLog(node, "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, 'ALARM');
							node.error("The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid);
							node.emit('Nodeoutput', [null, {payload: "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, level: 'ALARM'}]);
							return;
						}*/
					} else {
						tLog(node, "The sent message is already in the queue. Request: " + msg.uniqid, 'WARNING');
						node.debug("Already in QUEUE!");
						return;
					}

					// check queue size
					/*if((100 / node.max_queuesize * node.queue.length) >= node.queuesize_warning) {
						node.emit('Nodeoutput', [null, {payload: "Warning: Your Queue reached the warning level of " + node.queuesize_warning + "% .", level: 'WARNING', quantity: node.queuesize_warning}]);
					}*/
				}

				xml = {
					'ESPA-X' : { $: { version:"1.00", xmlns: "http://ns.espa-x.org/espa-x", 'xmlns:xsi': "http://www.w3.org/2001/XMLSchema-instance", 'xsi:schemaLocation': "http://ns.espa-x.org/espa-x http://schema.espa-x.org/espa-x100.xsd",timestamp:(new Date()).toISOString().replace(/\..+/, '')},
						'REQ.LOGOUT': { $: {invokeID:msg.invokeid, sessionID:sid},
							'LO-REASON': msg.reason
						}
					}
				};

				try {
					node.connection[msg.used_connection].sendRequest(invokeID, xml);
				} catch(err) {
					node.debug({payload: "Error-Code: 4575a5c5", err: err, msg: xml});
					return;
				}
			} else if(msg.cmd == "stop") {

				if(!msg.again) {
					var ref;
					var tan;


					var tl = node.queue.length;
					var noInput = true;
					for(var i = 0; i<tl; i++) {
						if(typeof msg.event_id == 'string' && typeof node.queue[i].event_id == 'string') {
								// "normal" event_id
								if(msg.event_id == node.queue[i].event_id) {
									msg.ref = node.queue[i].uniqid;
									msg.tan = node.queue[i].tan;
									noInput = false;
									break;
								}
						} else if(typeof msg.event_id == 'object' && typeof node.queue[i].event_id == 'object') {
							// "customized" event_id
							if(msg.event_id.id == node.queue[i].event_id.id) {
								if(msg.event_id.custom.length == node.queue[i].event_id.custom.length) {
									var notEqual = false;
									for(var c = 0; c<msg.event_id.custom.length; c++) {
										if(typeof node.queue[i].event_id.custom[c] == 'undefined') {
											// return not doubled
											notEqual = true;
											break;
										} else if(node.queue[i].event_id.custom[c] == msg.event_id.custom[c]) {
											// do nothing because of check algorithm
										} else {
											// return not doubled
											notEqual = true;
											break;
										}
									}
									
									if(!notEqual) {
										// return doubled
										msg.ref = node.queue[i].uniqid;
										msg.tan = node.queue[i].tan;
										noInput = false;
										break;
									}
								}
							}
						}
					}

					if(noInput) {
						tLog(node, "The sent message cannot be mapped to a process. Request: " + msg.uniqid, 'WARNING');
						node.debug("Process is unknown!");
						return;
					}


					var invokeID = node.connection[msg.used_connection].getInvokeID();
					msg.invokeid = invokeID;

					if(!checkDouble(node, msg)) {
						// push message to process queue
						msg.timestamp = Date.now();
						/*if(node.queue.length < node.max_queuesize) {*/
							node.queue.push(msg);
						/*} else {
							tLog(node, "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, 'ALARM');
							node.error("The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid);
							node.emit('Nodeoutput', [null, {payload: "The ESPA-X queue is completely full and this message could not be safed and will be destroyed. Request: " + msg.uniqid, level: 'ALARM'}]);
							return;
						}*/
					} else {
						tLog(node, "The sent message is already in the queue. Request: " + msg.uniqid, 'WARNING');
						node.debug("Already in QUEUE!");
						return;
					}

					// check queue size
					/*if((100 / node.max_queuesize * node.queue.length) >= node.queuesize_warning) {
						node.emit('Nodeoutput', [null, {payload: "Warning: Your Queue reached the warning level of " + node.queuesize_warning + "% .", level: 'WARNING', quantity: node.queuesize_warning}]);
					}*/
				}

				xml = {
					'ESPA-X' : { $: { version:"1.00", xmlns: "http://ns.espa-x.org/espa-x", 'xmlns:xsi': "http://www.w3.org/2001/XMLSchema-instance", 'xsi:schemaLocation': "http://ns.espa-x.org/espa-x http://schema.espa-x.org/espa-x100.xsd",timestamp:(new Date()).toISOString().replace(/\..+/, '')},
						'REQ.P-STOP': { $: {invokeID:msg.invokeid, sessionID:sid},
							'CP-PR-REF': msg.ref,
							'SP-PR-TAN': msg.tan,
							'CP-PR-MASK': msg.mask
						}
					}
				};
				try {
					node.connection[msg.used_connection].sendRequest(invokeID, xml);
				} catch(err) {
					node.debug({payload: "Error-Code: aaad4582", err: err, msg: xml});
					return;
				}
			}
			updateFile(node);

		});


		/// EVENT-LISTENER
		/*
		 * on node close / re-deploy / remove
		 */
		this.on('close', function(removed, done) {
			if(node.hotStandbyWarningTimer) {
				clearTimeout(node.hotStandbyWarningTimer);
				node.hotStandbyWarningTimer = null;
			}

		if(job) {
			job.stop();
			job = null;
		}

			var msg = {};
			msg.a = {};
			msg.b = {};
			
			msg.a.cmd = "logout";
			msg.a.again = true;
			msg.b.cmd = "logout";
			msg.b.again = true;
			

			if(removed) {
				msg.a.reason = "Normal";
				msg.b.reason = "Normal";
			} else {
				msg.a.reason = "Reboot";
				msg.b.reason = "Reboot";
			}

			try {
				msg.a.invokeid = node.connection[0].getInvokeID();
				msg.a.used_connection = 0;
				node.emit('Command', msg.a);
			} catch(err) {
				node.debug({payload: "Error-Code: 07f30a03", err: err, msg: msg.a});
			}
			
			try {
				msg.b.invokeid = node.connection[1].getInvokeID();
				msg.b.used_connection = 1;
				node.emit('Command', msg.b);
			} catch(err){
				node.debug({payload: "Error-Code: 777125f3", err: err, msg: msg.b});
			}

			try {
				node.connection[0].close(removed, done);
			} catch(err) {
				node.debug({payload: "Error-Code: a2f7e4a9", err: err});
			}
				
			if(node.have_slave == "slave") {
				try {
					node.connection[1].close(removed, done);
				} catch(err) {
					node.debug({payload: "Error-Code: ec4e98f4", err: err});
				}
			}

			net_1 = null;
			net_2 = null;
			tls_1 = null;
			tls_2 = null;

			node.connection[0] = null;
			node.connection[1] = null;

			if(node.uespaxClient) {
				node.uespaxClient.releaseNode(node.uespaxNodeId);
			}

			// Keep the queue across a re-deploy or Node-RED restart, but remove
			// it once the associated ESPA-X server configuration is deleted.
			if(removed) {
				removeQueueFile(node);
			}

			node.removeAllListeners();
			node.warn("All Node-Listeners removed...");

			done();
		});
	}
	
	RED.nodes.registerType("t-daks espax-server",DaksEspaxServerNode);
	
	/*
	 * trigger "Nodestatus" event for espax node
	 */
	function updateNodeStatus(node, fillA, shapeA, textA) {
		var msg = {fill: fillA, shape: shapeA, text: textA};
		node.lastNodeStatus = msg;
		node.emit('Nodestatus', msg);
	}

	/*
	 * global tetronik log connector
	 */
	function tLog(node, message, level = 'INFO', location = node.name) {
        if(node.logging) {
            var out = {};
            out.payload = message;
            out.level = level;
            out.location = location;
            node.logging.emit('getData', out);
        }
	}
	
	/*
	 * check, if message is already in queue (true, if doubled > false if not in queue)
	 */
	function checkDouble(node, msg) {
		try {
			var tL = node.queue.length;
			for(var i = 0; i<tL; i++) {
				if(typeof node.queue[i] != 'undefined') {
					if(typeof node.queue[i].espax != 'undefined' && typeof msg.cmd != 'undefined') {
						return false;
					}
	
					if(typeof node.queue[i].event_id != 'undefined' && typeof msg.event_id != 'undefined' && typeof node.queue[i].espax != 'undefined'/* && typeof msg.espax != 'undefined'*/) {
						if(typeof msg.event_id == 'string' && typeof node.queue[i].event_id == 'string') {
							// "normal" event_id
							if(msg.event_id == node.queue[i].event_id) {
								// return doubled
								return true;
							}
						} else if(typeof msg.event_id == 'object' && typeof node.queue[i].event_id == 'object') {
							// "customized" event_id
							if(msg.event_id.id == node.queue[i].event_id.id) {
	
								if(msg.event_id.custom.length == node.queue[i].event_id.custom.length) {
									var doFind = 0;
									var meid_length = msg.event_id.custom.length;
									for(var c = 0; c<meid_length; c++) {
										if(typeof node.queue[i].event_id.custom[c] == 'undefined') {
											// break not doubled
											doFind = 0;
											break;
										} else if(node.queue[i].event_id.custom[c] == msg.event_id.custom[c]) {
											// do nothing because of check-algorithm
											doFind++;
										} else if(node.queue[i].event_id.custom[c] != msg.event_id.custom[c]) {
											// break not doubled
											doFind = 0;
											break;
										} else {
											// Should never happen
											node.warn("CD_E_C-else");
										}
									}
	
									if(doFind == 0) {
										// nothing found -> next
									} else if(doFind == meid_length) {
										// return doubled
										return true;
									}
								}
							}
						}
					}
				} else {
					node.queue.splice(i,1);
				}
			}
			return false;
		} catch(err) {
			node.debug({payload: "Error-Code: e860b71c", err: err, msg: msg});
		}
	}

	/*
	 * background queue handler
	 * check if there is a data timeout and update queue-file
	 */
	function serializableError(error) {
		if(error instanceof Error) {
			return {name: error.name, message: error.message, stack: error.stack};
		}
		return error;
	}

	/*
	 * A rejected P-START is normally retained in the server queue for retries.
	 * Once the retry/age limit finally discards that item, ESPA 4.4.4 consumers
	 * must be told explicitly.  Otherwise their local process cache still
	 * considers the same call active until a flow restart or its poll timeout.
	 */
	function emitFinalProcessRejection(node, message, reason, responseCode) {
		if(!message || typeof message.event_id === 'undefined' || !message.espax) {
			return;
		}

		node.emit('Nodeoutput', [{
			payload: {
				event_id: message.event_id,
				indication: 'p-start-rejected',
				final: true,
				result: reason || 'rejected',
				rspCode: responseCode,
				ref: message.uniqid || '',
				tan: typeof message.tan === 'undefined' ? '' : message.tan
			},
			msgtype: 'response',
			type: message.espax.type || ''
		}, null]);
	}

	function handleQueueData(node) {
		if(!node.connection || !node.connection[0]) {
			return;
		}

		if(typeof node.queue != 'undefined') {
			var tmpLength = node.queue.length;
			for(var i = 0; i<tmpLength; i++) {
				if(typeof node.queue[i] != 'undefined') {
					var ma = 0;

					// use temporary variable for max_age from queue-item or of not defined from preconfig
					if(typeof node.queue[i].max_age != 'undefined') {
						if(node.queue[i].max_age >= 1) {
							ma = node.queue[i].max_age;
						} else {
							ma = node.max_age;
						}
					} else {
						ma = node.max_age;
					}

					// check if there is at least one connection to a DAKS
					var tmpHQD = null;
					try {
						if(node.connection[1] != undefined) {
							tmpHQD = node.connection[1].getConnectionState();
						}
					} catch(err) {
						node.debug({payload: "Error-Code: 99ffb6a0", err: err});
					}
					
					try {
						if(node.connection[0].getConnectionState() || tmpHQD) {
							// Check, if the DAKS received the process. Check only, if msg-timestamp is older than 10s
							if(((node.queue[i].timestamp + (1000*10)) <= Date.now())) {
								if(typeof node.queue[i].send_confirmed != 'undefined') {
									if(!node.queue[i].send_confirmed) {
										var targetConnection = getPreferredActiveConnection(node);
										if(targetConnection !== null) {
											node.queue[i].used_connection = targetConnection;
											node.queue[i].again = true;
											node.emit("MessageToQueue", node.queue[i]);
										}
									}
								}
							}
	
							// Delete every item from queue, which runs in timeout
							if(((node.queue[i].timestamp + (ma*1000*60)) <= Date.now()) && node.queue[i].tan == undefined) {
								// delete if response code is 409 and max_age has been exceeded
								if(node.queue[i].last_error == 409) {
									tLog(node, "Delete old Data from client queue because the sent message returned an 409 error (CONFLICT) for multiple times. Reference: " + node.queue[i].uniqid, 'CRITICAL');
									emitFinalProcessRejection(node, node.queue[i], 'rejected after repeated 409 conflict', 409);
								} else {
									tLog(node, "Delete old Data from client queue. Data is older than " + (ma) + " minutes. Reference: " + node.queue[i].uniqid, 'WARNING');
								}
								
								node.queue.splice(i,1);
							}
							
							// Delete every item from queue, which runs in timeout >24h
							else if((node.queue[i].timestamp + (24*60*1000*60)) <= Date.now()) {
								tLog(node, "Delete old Data from client queue. Data is older than 24 hours. Reference: " + node.queue[i].uniqid, 'WARNING');
								node.queue.splice(i,1);
							}
							
							// Delete every item from queue, which has an error
							else if(node.queue[i].last_error != 'undefined') {
	
								// if error exists at least an hour
								if((node.queue[i].first_error + (1000*60*60)) <= Date.now()) {
									tLog(node, "Delete old Data from client queue because the sent message returned an error and could not be resent within an hour. Reference: " + node.queue[i].uniqid, 'CRITICAL');
									node.queue.splice(i,1);
								}
	
								// delete if response code is 406 and it occurs 2x
								else if(node.queue[i].last_error == 406 && node.queue[i].err_counter >= 2) {
									tLog(node, "Delete old Data from client queue because the sent message returned an 406 error (NOT ACCEPTABLE) for two times. Reference: " + node.queue[i].uniqid, 'CRITICAL');
									node.queue.splice(i,1);
								}
	
								// delete if response code is 503 and it occurs 4x
								else if(node.queue[i].last_error == 503 && node.queue[i].err_counter >= 4) {
									tLog(node, "Delete old Data from client queue because the sent message returned an 503 error (SERVICE UNAVAILABLE) for four times. Reference: " + node.queue[i].uniqid, 'CRITICAL');
									node.queue.splice(i,1);
								}
	
								// check time until last error and resend if needed (after 10s)
								else if(node.queue[i].last_error_time + (1000*10) <= Date.now()) {
									// check message type
									// normal Message
									if(typeof node.queue[i].espax != 'undefined') {
										node.queue[i].again = true;
										node.emit("MessageToQueue", node.queue[i]);
									}
									// command Message
									else {
										node.queue[i].again = true;
										node.emit("Command", node.queue[i]);
									}
	
									//node.queue[i].last_error_time += (1000*60*60);
									node.queue[i].last_error_time = Date.now();
								}
							}
						}
					} catch(err) {
						node.debug({payload: "Error-Code: f89435fa", err: serializableError(err)});
					}
				} else {
node.warn("DELETE");
					node.queue.splice(i,1);
				}
			}
		}

		updateFile(node);
	}

	/*
	 * Change node state with master/slave detection
	 */
	function changeNodeState_Connection(node) {
		if(node.have_slave == "slave" && node.connection[1] != undefined) {
			var masterConnected = node.connection[0].getConnectionState();
			var slaveConnected = node.connection[1].getConnectionState();
			var masterActive = masterConnected && node.hotStandBy_master_active === true;
			var slaveActive = slaveConnected && node.hotStandBy_slave_active === true;
			var previousConnection = node.hotStandBy;

			// Prefer the configured primary DAKS whenever it is active. Only use
			// the secondary DAKS when the primary is unavailable or in Hot-Standby.
			if(masterActive) {
				node.hotStandBy = 0;
			} else if(slaveActive) {
				node.hotStandBy = 1;
			} else if(masterConnected) {
				node.hotStandBy = 0;
			} else if(slaveConnected) {
				node.hotStandBy = 1;
			}

			if(!masterConnected && !slaveConnected) {
				tLog(node, "Connection ERROR, no ESPA-X Master or Slave are available!", 'ALARM');
				updateNodeStatus(node, "red", "dot", "Connection ERROR");
				ctrlFrontLed(node,"red");
				publishConnectionState(node);
				return;
			}

			if(node.hotStandBy !== previousConnection) {
				tLog(node, node.hotStandBy === 0
					? "Switched connection to ESPA-X Master."
					: "Switched connection to ESPA-X Slave.", 'INFO');
			}

			var selectedActive = node.hotStandBy === 0 ? masterActive : slaveActive;
			var selectedName = node.hotStandBy === 0 ? "Master" : "Slave";
			updateNodeStatus(node, selectedActive ? "green" : "yellow", "dot",
				selectedActive ? "Connected to " + selectedName : "Connected to " + selectedName + " (Hot-Standby)");
			ctrlFrontLed(node, selectedActive ? "green" : "yellow");
		} else if(node.connection[0] != undefined) {
			// connected
			if(node.connection[0].getConnectionState()) {
				tLog(node, "Reconnected to ESPA-X Server", 'INFO');
				updateNodeStatus(node, "green", "dot", "Connected to Server");
				ctrlFrontLed(node,"green");
			}
			// not connected
			else {
				tLog(node, "Connection ERROR, no ESPA-X Server are available!", 'ALARM');
				updateNodeStatus(node, "red", "dot", "Connection ERROR");
				ctrlFrontLed(node,"red");
			}
		} else {
			tLog(node, "Connection ERROR, no ESPA-X Server are available!", 'ALARM');
			updateNodeStatus(node, "red", "dot", "Connection ERROR");
			ctrlFrontLed(node,"red");
		}

		publishConnectionState(node);
	}
	
	/*
	 * Check for Kunbus Revolution-Pi and control LED A3
	 */
	function ctrlFrontLed(node, color) {
		var check = process.env.isKunbus || process.env.isDAKS110 || null;
		if(check == "isTetronik") {
			switch(color) {
				case "green":
					setFrontLedColor(node,2,1);
					setFrontLedColor(node,3,0);
					setFrontLedColor(node,-1,"green");
					break;
				case "yellow":
					setFrontLedColor(node,2,1);
					setFrontLedColor(node,3,1);
					setFrontLedColor(node,-1,"blink_green");
					break;
				case "red":
					setFrontLedColor(node,2,0);
					setFrontLedColor(node,3,1);
					setFrontLedColor(node,-1,"red");
					break;
				case "off":
				default:
					setFrontLedColor(node,2,0);
					setFrontLedColor(node,3,0);
					setFrontLedColor(node,-1,"off");
			}
		}
	}
	
	/*
	 * Set LED-Colors and do it by selecting the correct command
	 */
	function setFrontLedColor(node, pin, state) {
		var check = process.env.isSystem || null;
		switch(check) {
			case "stretch-gpio":
				if(pin != -1) {
					shellExec(node, "gpio write " + pin + " " + state);
				}
				break;
			case "buster-raspi-gpio":
				if(pin != -1) {
					var pinState = "dl";
					if(state == 1) {
						pinState = "dh";
					}
					shellExec(node, "raspi-gpio set " + pin + " " + pinState);
				}
				break;
			case "daks-gpio":
				if(pin == -1) {
					shellExec(node, "echo setled " + state + " > /dev/tetronik_platform");
				}
				break;
			default:
				node.debug({payload: "Error-Code: 5ed719e4", err: "Missing environment variable."});
		}
	}
	
	/*
	 * Execute command on shell with the Node-RED runtime user
	 */
	function shellExec(node, cmd) {
		try {
			var exec = require('child_process').exec;
			const {stdout, stderr} = exec(cmd, {encoding:'binary', maxBuffer:RED.settings.execMaxBufferSize||10000000});
			return stdout;
		} catch(err) {
			node.debug({payload: "Error-Code: b31c4b5c", err: err});
			return "";
		}
	}

	/*
	 * Replace all UTF-8 Ctrl-Characters with "" (nothing)
	 */
	function removeUTF8Ctrls(str) {
		str = str + "";
		return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
	}

	/*
	 * queue-file handler
	 */
	function updateFile(node, read = false) {
        var fs = require('fs');

		var fifoPath = queueFilePath(node);
	
        if(read) {
            var lineReader = require('readline');
        
            async function readLineByLine() {
                const file = fs.createReadStream(fifoPath);
                var read = lineReader.createInterface({input: file, crlfDelay: Infinity});

                for await (const line of read) {
                    if(line != "") {
						var json = JSON.parse(line);
                        node.queue.push(json);
                    }
                }
				read.close();
				if(node.queue.length == 0) {
					tLog(node, "Read already queued data from file.", 'INFO');
				}
            }
        
            if(fs.existsSync(fifoPath)) {
                readLineByLine();
            }
        
        } else {
            var file = fs.createWriteStream(fifoPath);
            file.on('error', function(err) {
                //ERROR HANDLING
				node.debug(err);
                tLog(node, err, 'ERROR');
                file.end();
            });
			
           	node.queue.forEach(function(v) {
               	var tmp = JSON.stringify(v);
               	tmp += '\n';
              	file.write(tmp);
			});
			file.end();    
        }
	}

	function queueFilePath(node) {
		var fifoPath = 'queue_'+node.id+'.fifo';
		if(process.env.isSystem == "daks-gpio") {
			if(process.env.isContainerFS == "true") {
				fifoPath = "/data/NodeRed/" + fifoPath;
			} else {
				fifoPath = "/parts/data/NodeRed/" + fifoPath;
			}
		}
		return fifoPath;
	}

	function removeQueueFile(node) {
		var fs = require('fs');
		var fifoPath = queueFilePath(node);

		try {
			fs.unlinkSync(fifoPath);
			tLog(node, "Deleted queue file for removed ESPA-X server configuration.", 'INFO');
		} catch(err) {
			if(err && err.code !== 'ENOENT') {
				node.debug({payload: "Error-Code: b074b0e9", err: err, fifoPath: fifoPath});
				tLog(node, err, 'ERROR');
			}
		}
	}

	function getPreferredActiveConnection(node) {
		if(node.connection && node.connection[0] && node.connection[0].getConnectionState() &&
			node.hotStandBy_master_active === true) {
			return 0;
		}

		if(node.connection && node.connection[1] && node.connection[1].getConnectionState() &&
			node.hotStandBy_slave_active === true) {
			return 1;
		}

		return null;
	}

	/*
	 * Expose the two DAKS states independently from the human-readable Node-RED
	 * status text. Satellite system-status contacts must not infer these flags
	 * from labels such as "Connected to Master" or "Connected to Slave".
	 */
	function getEspaxConnectionStatus(node) {
		function isConnected(index) {
			try {
				return Boolean(node.connection && node.connection[index] &&
					node.connection[index].getConnectionState());
			} catch(err) {
				return false;
			}
		}

		var primaryConnected = isConnected(0);
		var secondaryConfigured = node.have_slave == "slave" && Boolean(node.connection && node.connection[1]);
		var secondaryConnected = secondaryConfigured && isConnected(1);
		var primaryActive = primaryConnected && node.hotStandBy_master_active === true;
		var secondaryActive = secondaryConnected && node.hotStandBy_slave_active === true;

		return {
			anyActive: primaryActive || secondaryActive,
			primary: {connected: primaryConnected, active: primaryActive},
			secondary: {connected: secondaryConnected, active: secondaryActive}
		};
	}

	function publishConnectionState(node) {
		var state = getEspaxConnectionStatus(node);
		node.connectionStatus = state;
		node.emit('Connectionstate', state);
	}
	
	/*
	 * message error setter / counter
	 */
	function detectedError(item,code) {
		if(item.last_error != 'undefined' && item.err_counter > 0) {
			item.last_error_time = Date.now();
			if(item.last_error == code) {
				item.err_counter += 1;
			} else {
				item.last_error = code;
				item.err_counter = 1;
			}
		} else {
			item.last_error = code;
			item.err_counter = 1;
			item.first_error = Date.now();
			item.last_error_time = item.first_error;
		}

		return item;
	}

	/// CLASS
	/*
	 * define espa-x message for daks
	 */
    function EspaXMessage(number, obj) {
		var data = null;
		var xml = "";
		var xbuf = null;
		var length = 0;
		var nr = 0;
		var buffer = null;
		var position = 0;

		var that = this;

		this.onReceived = null;
		this.error = null;

		if(obj != null) {
			data = obj;
			xml = xmlBuilder.buildObject(obj);
			xbuf = Buffer.from(xml, "utf8");
			
			length = xbuf.length + 10;	// xml length + header
			buffer = new Buffer.alloc(length);	// allocate ram for buffer

			// fill buffer with header data
			// Add 'EX'
			buffer[0] = 'E'.charCodeAt();
			buffer[1] = 'X'.charCodeAt();

			// 2 bytes reserved
			buffer[2] = 0;
			buffer[3] = 0;

			// 2 bytes length
			buffer[4] = length >>> 8;
			buffer[5] = length & 0x00FF;

			// 4 byte number
			buffer[6] = nr >>> 24;
			buffer[7] = (nr >>> 16) & 0x000000FF;
			buffer[8] = (nr >>> 8) & 0x000000FF;
			buffer[9] = nr & 0x000000FF;

			// fill buffer with xml data
			buffer.fill(xbuf, 10);
		}

		if(number != undefined) {
			nr = number;
		}

		/*
		 * Getter
		 */
		this.getNumber = function() { return nr; }
		this.getBuffer = function() { return buffer; }
		this.getData = function() { return data; }

		/*
		 * Setter
		 */
		this.write = function(buffer, len) {
			for(var i = 0; i < len; i++) {
				switch(position) {
					case 0:
						// reset
						xml = "";
						data = null;
						if(buffer[i] == 'E'.charCodeAt()) {
							position++;
						} else {
							that.error = "Invalid header";
						}
						break;
					case 1:
						if(buffer[i] == 'X'.charCodeAt()) {
							position++;
						} else {
							that.error = "Invalid header";
						}
						break;
					case 2:
					case 3:
						position++;
						break;
					case 4:
						length = buffer[i] << 8;
						position++;
						break;
					case 5:
						length |= buffer[i];
						position++;
						break;
					case 6:
						nr = buffer[i] << 24;
						position++;
						break;
					case 7:
						nr |= buffer[i] << 16;
						position++;
						break;
					case 8:
						nr |= buffer[i] << 8;
						position++;
						break;
					case 9:
						nr |= buffer[i];
						position++;
						break;
					
					default:
						if(position >= 10) {
							xml += String.fromCharCode(buffer[i]);
							position++;
							if(position >= length) {
								xml2js.parseString(xml, onSerialized);
								position = 0;
							}
						}
						break;
				}
			}

			return (data != null);
		};

		/*
		 * Serialize
		 */
		var onSerialized = function(err, result) {
			if(err == null) {
				data = result;
				
				if(that.onReceived != null) {
					that.onReceived(that);
				}
			} else {
				that.error = err.message;
			}
		}
    }

	/// CLASS
	/*
	 *define and handle espa-x connection
	 */
    function EspaXConnection(node, config, master, net, tls) {
		var curInvokeID = 0;
		var sessionID = undefined;
        var curMsg = null;
		var requests = new Array();
		var uespaxRequired = Boolean(config.use_uespax);
		var uespaxLogin = config.use_uespax && node.uespaxClient
			? node.uespaxClient.createConnection(config, config.nodeId, config.connectionId, config.packageVersion)
			: null;
		var uespaxActive = Boolean(uespaxLogin);
		
		// timers
		var reConnectTimeout = 5;	// in seconds
		var reConnectTimeoutObj = null;
		var heartbeatTimer = null;
		var uespaxStateTimer = null;
		var uespaxServiceRetryRequested = false;
		var waitingForUespaxService = false;
		
		// little eager helper
		var that = this;

		// defines socket
		var tcpConnection = new net.Socket();

		function reportUespaxConnectionState(active) {
			if(!uespaxLogin) {
				return;
			}

			if(uespaxStateTimer) {
				clearInterval(uespaxStateTimer);
				uespaxStateTimer = null;
			}

			uespaxLogin.setConnectionState(active, function() {});

			if(active) {
				// Keep the WebConfiguration-side authorization lease alive. If
				// Node-RED stops unexpectedly, the lease expires and the local
				// ESPA4.4.4 proxy is closed automatically.
				uespaxStateTimer = setInterval(function() {
					uespaxLogin.setConnectionState(true, function() {});
				}, 10000);
			}
		}

		function scheduleUespaxServiceRetry(message) {
			if(!waitingForUespaxService) {
				tLog(node, message, "WARNING");
				waitingForUespaxService = true;
			}

			updateNodeStatus(node, "yellow", "ring", "Waiting for uESPA-X service...");
			clearTimeout(reConnectTimeoutObj);
			reConnectTimeoutObj = setTimeout(reConnectTimer, 2000);
		}

		function waitForUespaxService() {
			if(!uespaxRequired || uespaxClient.isAvailable()) {
				if(waitingForUespaxService) {
					tLog(node, "uESPA-X IPC is now available. Connecting to DAKS.", "INFO");
					waitingForUespaxService = false;
				}
				return false;
			}

			scheduleUespaxServiceRetry("uESPA-X IPC socket is not ready yet; retrying automatically.");
			return true;
		}

		function retryAfterUespaxTransportError(message) {
			if(!waitingForUespaxService) {
				tLog(node, message, "WARNING");
				waitingForUespaxService = true;
			}

			updateNodeStatus(node, "yellow", "ring", "Waiting for uESPA-X service...");
			uespaxServiceRetryRequested = true;
			if(tcpConnection) {
				tcpConnection.destroy();
			} else {
				scheduleUespaxServiceRetry(message);
			}
		}

		// check, if config data is set
        if(config == null) {
            return;
		}
		
		if(config.usessl) {
			tcpConnection = null;
		}

	// ###### Connect to DAKS ######
		/*
		 * connect socket to daks
		 */
        var connect = function() {
			// Node-RED can be ready before the WebConfiguration backend has
			// created its IPC socket. Delay the TCP login until the required
			// local service exists, instead of turning this startup race into a
			// permanent login_failed state.
			if(waitForUespaxService()) {
				return;
			}

			var path = require('path');
			if(tcpConnection == null) {
				if(config.usessl) {
					tcpConnection = null;
				} else {
					tcpConnection = net.Socket();
				}
			}
			try {
				// Triggers if the login procedure failed to prevent infinite login tries.
				if(node.login_failed[(master?0:1)]) {
					return;
				}

				var options = {};	// tcp options
				if(config.usessl) {
					if(config.validate_certificate) {
						options = {
							host: config.ip,
							port: parseInt(config.port),
							requestCert: true, /* Auf Dauer-TRUE, bis manuelle Client-Zertifikate unterstütz werden */
							rejectUnauthorized: config.validate_certificate,
							ca: require('fs').readFileSync(path.join(__dirname,'..','ca','tetronik_DAKS-DEV_CA_2027.crt')),
						};
					} else {
						options = {
							host: config.ip,
							port: parseInt(config.port),
							requestCert: true, /* Auf Dauer-TRUE, bis manuelle Client-Zertifikate unterstütz werden */
							rejectUnauthorized: config.validate_certificate
						};
					}
					tcpConnection = tls.connect(options, onConnected);
				} else {
					options = {
						host: config.ip,
						port: parseInt(config.port, 10)
					};
					tcpConnection.connect(options, onConnected);
				}

				if(config.usessl) {
					node.debug("Client connected ", tcpConnection.authorized ? 'authorized':'unauthorized');
				}

				setTimeout(function() {
					if(tcpConnection != null) {
						if(tcpConnection.pending) {
							tcpConnection.destroy();
							tcpConnection = null;
							clearTimeout(reConnectTimeoutObj);
							reConnectTimeoutObj = setTimeout(reConnectTimer, reConnectTimeout * 1000);
						} else {
							node.socketErrorMessage = false;
						}
					}
				}, 2500);

				/// EVENT-LISTENER
				/*
				 * on socket error
				 */
				tcpConnection.on('error', function(error) {
					updateNodeStatus(node, "red", "dot", "Socket error...");
					tLog(node, "Socket error: " + tcpConnection.remoteAddress, 'ERROR');
					tcpConnection.destroy();
					tcpConnection = null;
				
				});
			
				/// EVENT-LISTENER
				/*
				 * on socket input data
				 */
				tcpConnection.on('data', function(data) {
					if(curMsg == null) {
						curMsg = new EspaXMessage();
						curMsg.onReceived = onMessage;
					}
				
					if(curMsg.write(data, data.length)) {
						curMsg = null;
					} else if(curMsg.error != undefined) {
						tLog(node, "Invalid message received: " + curMsg.error, 'ERROR');
						curMsg = null;
					}
				});
			
				/// EVENT-LISTENER
				/*
				 * on socket close
				 */
				tcpConnection.on('close', function() {
					tLog(node, "Connection closed...", 'INFO');
					reportUespaxConnectionState(false);
					node.markDaksConnectionInactive(master);
				try {
						if(tcpConnection != null) {
							tcpConnection.destroy();
						}
					} catch(err) {}
					tcpConnection = null;
					sessionID = null;

					clearTimeout(heartbeatTimer);
					heartbeatTimer = null;
					clearTimeout(reConnectTimeoutObj);
					reConnectTimeoutObj = setTimeout(reConnectTimer, uespaxServiceRetryRequested ? 2000 : reConnectTimeout * 1000);
					uespaxServiceRetryRequested = false;
					
					// Set all active processes in the local queue from this connection to "not sent"
					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].uniqid != 'undefined') {
							if(node.queue[i].used_connection == (master?0:1)) {
								if(node.queue[i].send_confirmed) {
									node.queue[i].send_confirmed = false;
								}
							}
						}
					}
				
					// change to other connection
					changeNodeState_Connection(node);
				});
			} catch(err) {
				tLog(node, err, 'INFO');
				clearTimeout(reConnectTimeoutObj);
				reConnectTimeoutObj = setTimeout(reConnectTimer, reConnectTimeout * 1000);
			}
        }

		/// EVENT-LISTENER
		/*
		 * first action after ready socket connection
		 * sets status to "Send login" and sends login message to daks
		 */
		function createLegacyLoginXml(invokeID) {
			return {
				'ESPA-X' : { $: { version:"1.00", timestamp:(new Date()).toISOString().replace(/\..+/, '')},
					'REQ.LOGIN': { $: {invokeID: invokeID},
						'LI-CLIENT': config.client,
						'LI-CLIENTSW': config.sw,
						'LI-USER': config.user,
						'LI-PASSWORD': config.pwd,
					}
				}
			};
		}

		function failUespaxLogin(message) {
			tLog(node, message, "ERROR");
			updateNodeStatus(node, "red", "dot", "uESPA-X unavailable");
			node.login_failed[(master?0:1)] = true;

			if(tcpConnection) {
				tcpConnection.destroy();
				tcpConnection = null;
			}
		}

        var onConnected = function() {
			tLog(node, "Login to server: " + config.ip, 'INFO');
			node.debug("Encryption enabled: " + tcpConnection.encrypted);

            var invokeID = getNextInvokeID();

			if(uespaxRequired && !uespaxLogin) {
				retryAfterUespaxTransportError("uESPA-X IPC client is not available yet; retrying automatically.");
				return;
			}

			if(uespaxActive) {
				uespaxLogin.createInitialLogin(invokeID, function(error, result) {
					if(error) {
						retryAfterUespaxTransportError("uESPA-X IPC login setup is temporarily unavailable: " + error.message);
						return;
					}

					if(!result || !result.ok || !result.loginXml) {
						var message = result && result.message ? result.message : "Unknown error";
						failUespaxLogin("uESPA-X login setup failed. Legacy ESPA-X fallback is disabled. Reason: " + message);
						return;
					}

					that.sendRequest(invokeID, result.loginXml);
				});
				return;
			}

            that.sendRequest(invokeID, createLegacyLoginXml(invokeID));
		}
	// ###### END - Connect to DAKS ######

	// ###### handle Requests ######
		/*
		 * sends a message to daks
		 */
		this.sendRequest= function(id, data) {
			var msg = new EspaXMessage(id, data);
			requests.push(msg);
			if(tcpConnection != null) {
				if(this.getConnectionState) {
					tcpConnection.write(msg.getBuffer());
				}
			}
		}

		/*
		 * returns a specific message from array by the invokeID
		 */
		var pullRequest = function(invokeID) {
			var tmp = null;

			for(var i = 0; i < requests.length; i++) {
				if(requests[i].getNumber() == invokeID) {
					tmp = requests.splice(i,1);
					break;
				}
			}

			return tmp;
		}
	// ###### END - handle Requests ######

	// ###### MESSAGE HANDLING ######
		/// EVENT-LISTENER
		/*
		 * handles incoming message from daks
		 */
		var onMessage = function(msg) {
			var data = msg.getData();
			var root = data["ESPA-X"];

			// stops following steps, if data was empty
			if(root == undefined) {
				return;
			}

			var entries = Object.entries(root);

			// stops following steps, if less then two entries where sent
			if(entries.length < 2) {
				tLog(node, "There were two less entries in the sent data.", 'ERROR');
				return;
			}

			var cmdName = entries[1][0];
			var cmdParams = entries[1][1][0];

			node.debug("Message reveived: " + cmdName);

			// The Node-RED module only identifies the proprietary envelope. Its
			// uESPA-X contents are interpreted by the WebConfig backend.
			if(cmdName == "PROPRIETARY" && uespaxActive) {
				that.handleUespaxProprietary(cmdParams);
				return;
			}

			var invokeID;
			try {
				invokeID = parseInt(cmdParams.$["invokeID"]);
			} catch(err) {

			}

			/*
			 * DAKS process indications, e.g. IND.P-STATUS, do not carry an
			 * invokeID. They are unsolicited by definition but still have to reach
			 * onResponse(), where process indications are forwarded to Node-RED.
			 */
			var isIndication = cmdName.substr(0,3) == "IND";
			if(isIndication || invokeID != undefined) {
				var req = invokeID != undefined ? pullRequest(invokeID) : null;

				if(!isIndication && cmdName.substr(0,3) == "CMD" && that.onCommand != null) {
					that.onCommand(cmdName, cmdParams);
				} else {
					if(req == null && !isIndication) {
						tLog(node, "No corresponding request found for invokeID=" + invokeID, 'WARNING');
					}
					that.onResponse(cmdName, cmdParams, req);
				}
			} else if(that.onCommand != null) {
				that.onCommand(cmdName, cmdParams);
			}
		}

		/*
		 * IND.C-STATUSIN does not have a matching response and therefore must
		 * not enter the regular request queue.
		 */
		this.sendIndication = function(data) {
			var msg = new EspaXMessage(undefined, data);
			if(tcpConnection != null && that.getConnectionState()) {
				tcpConnection.write(msg.getBuffer());
			}
		}

		this.sendUespaxInputStatus = function(payload, callback) {
			if(!uespaxActive || !uespaxLogin) {
				callback(new Error("uESPA-X is not active for this ESPA-X connection."));
				return;
			}

			uespaxLogin.sendInputStatus(payload, function(error, result) {
				if(error || !result || !result.ok || !result.xml) {
					callback(error || new Error(result && result.message ? result.message : "uESPA-X digital I/O input was rejected."));
					return;
				}

				that.sendIndication(result.xml);
				callback(null, result);
			});
		}

		this.handleUespaxProprietary = function(params) {
			if(!uespaxActive || !uespaxLogin) {
				return;
			}

			uespaxLogin.parseOutputStatus(params, function(error, result) {
				if(error || !result || !result.ok) {
					var message = error ? error.message : (result && result.message ? result.message : "The proprietary uESPA-X command was rejected.");
					tLog(node, message, 'WARNING');
					node.emit('Nodeoutput', [null, {payload: message, level: 'WARNING'}]);
					return;
				}

				if(!result.matched) {
					return;
				}

				node.emit('Nodeoutput', [{
					msgtype: "uespax-io",
					payload: {
						uespaxIo: result.output
					},
					type: "outputs"
				}, null]);
			});
		}

		this.sendSatelliteParameters = function() {
			if(!node.use_uespax || !sessionID) {
				return;
			}

			function conversationInput(value) {
				if(!node.extended_status) return undefined;
				if(value === "no-input") return "No";
				if(value === "1" || value === "#") return value;
				return "Off";
			}

			var callbackDisconnect = [];
			if(node.extended_status && node.hash_evaluation && node.hash_disconnects) callbackDisconnect.push("#");
			if(node.extended_status && node.one_evaluation && node.one_disconnects) callbackDisconnect.push("1");
			var invokeID = getNextInvokeID();
			var satelliteParameters = {
				'KEYPADECHO': node.keypad_echo ? "true" : "false"
			};

			// These extension fields deliberately remain absent when extended
			// status is disabled. That matches the former Satellite, which lets
			// the DAKS defaults apply rather than sending inactive values.
			if(callbackDisconnect.length) satelliteParameters['CALLBACKDISC'] = callbackDisconnect.join(" ");
			if(node.extended_status) {
				satelliteParameters['CONV-PRIO-INP'] = conversationInput(node.key_prioritize);
				satelliteParameters['CONV-NOTE-INP'] = conversationInput(node.key_note);
				satelliteParameters['CONV-STOP-INP'] = conversationInput(node.key_stop);
			}

			var parametersXml = {
				'ESPA-X': { $: { version:"1.00", timestamp: (new Date()).toISOString().replace(/\..+/, '')},
					'REQ.S-PARAMETERS': { $: { invokeID: invokeID, sessionID: sessionID},
						'PROPRIETARY': {
							'DAKS_ESPA-X': { $: {
								xmlns: "http://ns.tetronik.com/DAKS_ESPA-X",
								version: "1.15"
							},
								'PARAMS1': satelliteParameters
							}
						}
					}
				}
			};

			that.sendRequest(invokeID, parametersXml);
		}

		var handleSuccessfulLogin = function(params) {
			sessionID = params.$["sessionID"];

			// Check, if ESPA-X Server is a DAKS
			var allowedDevices = ["DAKS-Pro","eco-","med-","alert-"];
			var serversw = params["LI-SERVERSW"][0];
			var checkOK = false;

			for(var i = 0 ; i < allowedDevices.length ; i++) {
				if(serversw.startsWith(allowedDevices[i])) {
					checkOK = true;
					break;
				}
			}

			if(!checkOK) {
				tLog(node, "Error on DAKS login. Please check DAKS-Version.", "ERROR");
				node.login_failed[(master?0:1)] = true;
				tcpConnection.destroy();
				tcpConnection = null;
				return;
			}
			// END - Check, if ESPA-X Server is a DAKS

			tLog(node, "Successfull login.", 'INFO');
			setTimeout(onAliveTimer, 5000);
			tLog(node, "Alive timer is running.", 'INFO');
			tLog(node, "NodeRed is connected to DAKS.", 'INFO');
			changeNodeState_Connection(node);

			var invokeID = getNextInvokeID();
			var conditionXml = {
				'ESPA-X' : { $: { version:"1.00", timestamp: (new Date()).toISOString().replace(/\..+/, '')},
					'REQ.S-CONDITION': { $: { invokeID: invokeID, sessionID: sessionID}
					}
				}
			};
			that.sendRequest(invokeID, conditionXml);
			that.sendSatelliteParameters();
		}

		/// EVENT-LISTENER
		/*
		 * does some action, depending on input message
		 * not all espa-x attributes are supported
		 */
		this.onResponse = function(name, params, req) {
			function first(value) {
				return Array.isArray(value) ? value[0] : value;
			}

			function emitProcessIndication(reference, tan, indication, details) {
				var refValue = String(first(reference) || "");
				var tanValue = Number.parseInt(first(tan), 10);
				var message = node.queue.find(function(entry) {
					return String(entry?.uniqid || "") === refValue &&
						(!Number.isFinite(tanValue) || Number(entry.tan) === tanValue);
				});

				if(!message || typeof message.event_id === "undefined") {
					return;
				}

				node.emit('Nodeoutput', [{
					payload: Object.assign({
						event_id: message.event_id,
						indication: indication,
						ref: refValue,
						tan: Number.isFinite(tanValue) ? tanValue : ""
					}, details || {}),
					msgtype: "response",
					type: message.espax?.type || ""
				}, null]);
			}

			switch(name) {
				// login response (logged in or error)
				case "RSP.LOGIN":
					var rspCode = parseInt(params["RSP-CODE"]);
					tLog(node, "Response >> Login.", 'INFO');

					if(uespaxActive) {
						var nextInvokeID = rspCode == 201 ? getNextInvokeID() : undefined;

						uespaxLogin.handleLoginResponse(params, rspCode, nextInvokeID, function(error, result) {
							if(error) {
								retryAfterUespaxTransportError("uESPA-X IPC authentication is temporarily unavailable: " + error.message);
								return;
							}

							if(!result || !result.ok) {
								var message = result && result.message ? result.message : "uESPA-X login failed.";
								failUespaxLogin(message);
								return;
							}

							if(result.status == "pending") {
								sessionID = result.sessionID;
								tLog(node, "uESPA-X authentication step 1 accepted. Sending second login request.", "INFO");
								that.sendRequest(nextInvokeID, result.loginXml);
								return;
							}

							if(result.status == "success") {
								try {
									reportUespaxConnectionState(true);
									handleSuccessfulLogin(params);
								} catch(e) {
									node.login_failed[(master?0:1)] = true;
									tLog(node, "uESPA-X login failed after authentication. Please check your DAKS settings and your login credentials.", "ERROR");
								}
								return;
							}

							tLog(node, "uESPA-X login returned an unsupported response state.", "ERROR");
							node.login_failed[(master?0:1)] = true;
							if(tcpConnection) {
								tcpConnection.destroy();
								tcpConnection = null;
							}
						});
						break;
					}

					if(rspCode == 200) {
						try {
							handleSuccessfulLogin(params);
						} catch(e) {
							// No login possible!
							// Authentication failed, no resilt given...
							node.login_failed[(master?0:1)] = true;
							tLog(node, "Login Failed on " + (master)?"Master":"Slave" + "! Please check your DAKS settings and your login credentials.", "ERROR");
						}
					} else if(rspCode == 401) { // unauthorized
						tLog(node, "Your login session is unauthorized.", 'ERROR');
						node.login_failed[(master?0:1)] = true;
					} else if(rspCode == 402) { // payment required
						tLog(node, "You license key is not valid or not enabled. Please contact support. Reference: " + ref, 'ERROR');
						node.login_failed[(master?0:1)] = true;
					}else {
						var tmp = "Master";
						if(!master) {
							tmp = "Slave";
						}
						tLog(node, "Login to " + tmp + " Server failed. Please verify your login credentials and your connection.", 'ERROR');
						tcpConnection.destroy();
						tcpConnection = null;
						clearTimeout(reConnectTimeoutObj);
					}
					break;
				
				// heartbeat response (resets heartbeat timer)
				case "RSP.HEARTBEAT":
					var rspCode = parseInt(params["RSP-CODE"]);
					tLog(node, "Response >> HEARTBEAT.", 'INFO');
					if(rspCode == 200) {
						if(heartbeatTimer != null) {
							clearTimeout(heartbeatTimer);
						}
						setTimeout(onAliveTimer, ((master)?node.timeout_main:node.timeout_slave) * 1000);
					}
					break;

				case "RSP.S-PARAMETERS":
					var parameterRspCode = parseInt(first(params["RSP-CODE"]));
					var parameterReason = first(params["RSP-REASON"]) || "";

					if(parameterRspCode === 200) {
						tLog(node, "Satellite ESPA4.4.4 parameters accepted by DAKS.", 'INFO');
					} else {
						tLog(node, "DAKS rejected Satellite ESPA4.4.4 parameters (" + parameterRspCode + "): " + parameterReason, 'ERROR');
					}
					break;

				// process start response (gives further information, if the process started or rejected with any problems)
				case "RSP.P-START":
					var rspCode = parseInt(params["RSP-CODE"]);
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					tLog(node, "Response >> START. Reference: " + ref, 'INFO');
					if(rspCode !== 200) {
						emitProcessIndication(ref, tan, "p-start-rejected", {
							result: first(params["RSP-REASON"]) || "rejected",
							rspCode: rspCode
						});
					}

					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].uniqid != 'undefined') {
							if(node.queue[i].uniqid == ref) {
								if(!node.queue[i].send_confirmed) {
									node.queue[i].send_confirmed = true;
								}
							}
						}
					}

					switch(rspCode) {
						case 200:
							tLog(node, ref + " OK with TAN: " + tan, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue[i].tan = tan;
										node.queue[i].timestamp = Date.now();
										node.queue[i].mag_age = 24 * 60 * 1000 * 60;
										node.queue[i].last_error = undefined;
										node.queue[i].err_counter = undefined;
										node.queue[i].first_error = undefined;
										node.queue[i].last_error_time = undefined;
									}
								}
							}
							break;

						case 400:	// bad request
							tLog(node, "There was an error in the data. Reference: " + ref, 'ERROR');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue.splice(i,1);
									}
								}
							}
							break;

						case 406:	// not acceptable
							tLog(node, "The process was not accepted. Reference: " + ref, 'WARNING');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue[i].send_confirmed = false;
										node.queue[i] = detectedError(node.queue[i],406);
									}
								}
							}
							break;

						case 409:	// conflict
							tLog(node, "There was a ressource conflict with process reference: " + ref, 'WARNING');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue[i].send_confirmed = false;
										node.queue[i] = detectedError(node.queue[i],409);
									}
								}
							}
							break;

						case 450:	// duplicate
							tLog(node, "The sent process is already in the DAKS: " + ref, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(typeof node.queue[i].uniqid != 'undefined') {
										if(node.queue[i].uniqid == ref) {
											node.queue.splice(i,1);
										}
									}
								}
							}
							break;
				
						case 503:	// Service Unavailable
							tLog(node, "The service in the DAKS is unavailable. Reference: " + ref, 'ERROR');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].uniqid == ref) {
											var targetConnection = getPreferredActiveConnection(node);
											if(targetConnection !== null) {
												node.queue[i].used_connection = targetConnection;
											}
										node.queue[i] = detectedError(node.queue[i],503);
									}
								}
							}
							break;

						default:
							tLog(node, "Status code not known. Message will be deleted with reference: " + ref, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue.splice(i,1);
									}
								}
							}
							break;
					}
					break;

				// process stop response (gives further information, with which state the process stopped)
				case "RSP.P-STOP":
					var rspCode = parseInt(params["RSP-CODE"]);
					var iID = parseInt(params.$["invokeID"]);
					tLog(node, "Response >> STOP. invokeID: " + iID, 'INFO');

					switch(rspCode) {
						case 200:
							tLog(node, "Stopped OK invokeID: " + iID, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].invokeid != 'undefined') {
									if(node.queue[i].invokeid == iID) {
										var eID = node.queue[i].event_id;
										node.queue.splice(i,1);
										
										var ti = node.queue.length;
										for(var i = 0; i < ti; i++) {
											if(typeof node.queue[i].event_id != 'undefined') {
												if(typeof node.queue[i].event_id == 'string' && typeof eID == 'string') {
													if(node.queue[i].event_id == eID) {
														node.queue.splice(i,1);
														return;
													}
												} else if(typeof node.queue[i].event_id == 'object' && typeof eID == 'object') {
													if(eID.id == node.queue[i].event_id.id) {
														if(eID.custom.length == node.queue[i].event_id.custom.length) {
															var doFind = 0;
															var meid_length = eID.custom.length;
															for(var c = 0; c < meid_length; c++) {
																if(typeof node.queue[i].event_id.custom[c] == 'undefined') {
																	// break not doubled
																	doFind = 0;
																	break;
																} else if(node.queue[i].event_id.custom[c] == eID.custom[c]) {
																	// do nothing because of check-algorithm
																	doFind++;
																} else if(node.queue[i].event_id.custom[c] != eID.custom[c]) {
																	// break not doubled
																	doFind = 0;
																	break;
																} else {
																	// Should never happen
																	node.warn("CD_E_C-else");
																}
															}
							
															if(doFind == 0) {
																// nothing found -> next
															} else if(doFind == meid_length) {
																// return doubled
																node.queue.splice(i,1);
																return;
															}
														}
													}
												}
											}
										}
									}
								}
							}
							break;

						case 400:	// bad request
							tLog(node, "There was an error in the data. Reference: " + ref, 'ERROR');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined' || typeof node.queue[i].invokeid != 'undefined') {
									if(node.queue[i].invokeid == iID) {
										node.queue.splice(i,1);
									}
								}
							}
							break;

						case 406:	// not acceptable
							tLog(node, "The process was not accepted. Reference: " + ref, 'WARNING');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(node.queue[i].invokeID == iID) {
										node.queue[i] = detectedError(node.queue[i],406);
									}
								}
							}
							break;

						case 409:	// conflict
							tLog(node, "There was a ressource conflict with process reference: " + ref, 'WARNING');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(node.queue[i].invokeID == iID) {
										node.queue[i] = detectedError(node.queue[i],409);
									}
								}
							}
							break;

						case 410:	// gone
							tLog(node, "The process is already stopped. Reference: " + ref, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i] != 'undefined') {
									if(typeof node.queue[i].uniqid != 'undefined' || typeof node.queue[i].invokeid != 'undefined') {
										if(node.queue[i].invokeid == iID) {
											node.queue.splice(i,1);
										}
									}
								}
							}
							break;

						case 450:	// duplicate
							tLog(node, "The sent process is already in the DAKS: " + ref, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined' || typeof node.queue[i].invokeid != 'undefined') {
									if(node.queue[i].invokeid == iID) {
										node.queue.splice(i,1);
									}
								}
							}
							break;

							case 503:	// service unavailable
							tLog(node, "The service in the DAKS is unavailable. Reference: " + ref, 'ERROR');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].invokeID == iID) {
											var targetConnection = getPreferredActiveConnection(node);
											if(targetConnection !== null) {
												node.queue[i].used_connection = targetConnection;
											}
										node.queue[i] = detectedError(node.queue[i],503);
									}
								}
							}
								
							break;
						default:
							tLog(node, "Status code not known. Message will be deleted with reference: " + ref, 'INFO');
							var tl = node.queue.length;
							for(var i = 0; i < tl; i++) {
								if(typeof node.queue[i].uniqid != 'undefined') {
									if(node.queue[i].uniqid == ref) {
										node.queue.splice(i,1);
									}
								}
							}
							break;
					}
					break;

				// process started indication
				case "IND.P-STARTED":
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					var phone = params["CP-PHONENO"] || params["CP-GROUPID"];
					var state = params["SP-STATUS"];
					tLog(node, "Indication >> STARTED. Reference: " + ref + ", State: " + state, 'INFO');
					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].uniqid != 'undefined') {
							if(node.queue[i].uniqid == ref && node.queue[i].tan == tan && node.queue[i].espax.number == phone) {
								node.queue[i].state = state;
								node.queue[i].last_error = undefined;
								node.queue[i].err_counter = undefined;
								node.queue[i].first_error = undefined;
								node.queue[i].last_error_time = undefined;
							}
						}
					}
					emitProcessIndication(ref, tan, "p-started", {
						state: first(state) || ""
					});
					break;

				// process ended indication
				case "IND.P-ENDED":
					node.debug("ENDED");
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					var result = params["SP-RESULT"];
					var endReason = params["SP-ENDREASON"];
					var eventId = null;
					var tl = node.queue.length;
					var type = null;

					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].uniqid != 'undefined' || typeof node.queue[i].event_id != 'undefined') {
							if(node.queue[i].uniqid == ref[0]) {
								eventId = node.queue[i].event_id;
								type = node.queue[i].espax.type;
							}
						}
					}
					if(first(result) !== undefined) {
						emitProcessIndication(ref, tan, "p-ended", {
							endReason: first(endReason) || "",
							result: first(result) || ""
						});
					}
					tLog(node, "Indication >> ENDED. Reference: " + ref + "" + ((result != undefined)?(", Result: " + result):"") + "" + ((endReason != undefined)?(", EndReason: " + endReason):"") + "", 'INFO');
					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i] != 'undefined') {
							if(typeof node.queue[i].uniqid != 'undefined') {
								if(node.queue[i].uniqid == ref && node.queue[i].tan == tan) {
									node.queue.splice(i,1);
								}
							}
						}
					}
					break;
				
				// process status indication
				case "IND.P-STATUS":
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					var state = params["SP-STATUS"];
					var result = params["SP-RESULT"];
					tLog(node, "Indication >> STATUS. Reference: " + ref + ", State: " + state, 'INFO');
					emitProcessIndication(ref, tan, "p-status", {
						result: first(result) || "",
						state: first(state) || ""
					});
					break;

				// process event indication
				case "IND.P-EVENT":
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					var state = params["SS-STATUS"];
					var result = params["SS-RESULT"];
					var direction = params["SS-DIRECTION"];
					/*var time = -1;
					
					try {
						var prop = params["PROPRIETARY"];
						var daks_espa = prop["DAKS_ESPA-X"];
						var event1 = daks_espa["EVENT1"];
						time = event1["SS-TIME"];
					} catch(err) {}*/
					
					var eventId = null;
					var type = null;

					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].uniqid != 'undefined' || typeof node.queue[i].event_id != 'undefined') {
							if(node.queue[i].uniqid == ref[0]) {
								eventId = node.queue[i].event_id;
								type = node.queue[i].espax.type;
							}
						}
					}
					if(type != "group") {
						node.emit('Nodeoutput', [{"payload":{"event_id":eventId,"state":(state!=undefined)?state[0]:"","result":result[0],"ref":ref[0],"tan":tan},"msgtype":"response","type":(type!=undefined)?type:""},null]);
					}
					tLog(node, "Indication >> EVENT. Reference: " + ref + ", State: " + state + ", Result: " + result + ", Direction: " + direction, 'INFO');
					break;

				// server conditions
				case "RSP.S-CONDITION":
					var rspCode = params["RSP-CODE"];
					var rspReason = params["RSP-REASON"];
					var health = params["S-HEALTH"];
					var hotstby = params["S-HOTSTBY"];
					var load = params["S-LOAD"];

					node.updateHotStandbyState(master, hotstby);

					tLog(node, "Servercondition >> Response-Code: " + rspCode + ", Response-Reason: " + rspReason + ", Server-Health: " + health + ", Hot-Standby: " + hotstby + ", Server-Load: " + load, 'INFO');
					break;

				case "IND.S-SYSTEM":
					var health = params["S-HEALTH"];
					var hotstby = params["S-HOTSTBY"];
					var load = params["S-LOAD"];


					node.updateHotStandbyState(master, hotstby);

					tLog(node, "Servercondition >> Server-Health: " + health + ", Hot-Standby: " + hotstby + ", Server-Load: " + load, 'INFO');
					break;

				// espa-x, client-logout
				case "RSP.LOGOUT":
					var iID = params["invokeID"];
					var tl = node.queue.length;
					for(var i = 0; i < tl; i++) {
						if(typeof node.queue[i].invokeID != 'undefined') {
							if(node.queue[i].invokeID == iID) {
								node.queue.splice(i,1);
							}
						}
					}

					tLog(node, "Logged out from DAKS \"" + tcpConnection.remoteAddress + "\", connection closed.", 'INFO');
					break;

				// default state, if no other cas was triggered
				default:
					break;
			}
		}

		/// EVENT-LISTENER
		this.onCommand = function(name, params) {
			switch (name) {
				case "CMD.C-STATUSOUT":
					that.handleUespaxProprietary(params);
					break;

				// get shutdown command from server, to close client connection
				case "CMD.SHUTDOWN":
					var reason = params["SD-REASON"];
					var mode = params["SD-MODE"];

					tLog(node, "The DASK-Server \"" + tcpConnection.remoteAddress + "\" stops the connection with reason \"" + reason + "\" and mode \"" + mode + "\"", 'WARNING');
					tcpConnection.destroy();
					updateNodeStatus(node, "red", "dot", "Connection was stopped by server");
					break;

				// default state, if no other cas was triggered
				default:
					break;
			}
		}
	// ###### END - MESSAGE HANDLING ######

	// ###### Timer-Methods ######
		/// EVENT-LISTENER
		/*
		 * sends heartbeat every predefined seconds, to keep the connection active
		 */
		var onAliveTimer = function() {
			if(tcpConnection != null) {
				var invokeID = getNextInvokeID();

				var hrtbXml = {
					'ESPA-X' : { $: { version:"1.00", timestamp: (new Date()).toISOString().replace(/\..+/, '')},
						'REQ.HEARTBEAT': { $: { invokeID: invokeID, sessionID: sessionID}
						}
					}
				};

				that.sendRequest(invokeID, hrtbXml);
				heartbeatTimer = setTimeout(onHeartbeatTimeout, 2000);
			}
		}

		/// EVENT-LISTENER
		/*
		 * closes the connection, if there is no response ti a heartbeat in a given time
		 */
		var onHeartbeatTimeout = function() {
			tLog(node, "Timeout on heartbeat request!!! - " + config.name, 'ERROR');
			if(tcpConnection != null) {
				tcpConnection.destroy();
			}
		}

		/*
		 * reconnect socket, after specific amount of time
		 */
		var reConnectTimer = function() {
			reConnectTimeoutObj = null;

			if(node.login_failed[(master?0:1)]) {
				tLog(node, "Reconnect suppressed after ESPA-X login/authentication failure. Redeploy or restart Node-RED after fixing the configuration.", 'WARNING');
				return;
			}

			tLog(node, "Try to reconnect to Server: " + config.name, 'INFO');
			connect();
		}
	// ###### END - Timer-Methods ######

	// ###### some help methods ######
		/*
		 * adds 1 to invokeID and returns it
		 */
        function getNextInvokeID() {
            return curInvokeID++;
        }

		/*
		 * close THIS connection
		 */
		this.close = function(removed, done) {
			reportUespaxConnectionState(false);
			try {
				tcpConnection.destroy();
			} catch(err) {}
			try {			
				tcpConnection.removeAllListeners();
			} catch(err) {}
			
			node.warn("All TCP-Listeners removed...");
			tcpConnection = null;
			
			clearTimeout(reConnectTimeoutObj);
			reConnectTimeoutObj = null;
			clearTimeout(heartbeatTimer);
			heartbeatTimer = null;
			node.warn("All TCP-Class-Listeners removed...");
			
			done();
		}

		/*
		 * starts a connection to daks
		 */
		this.start = function() {
			connect();
		}

		/*
		 * public function to get the next invokeID
		 */
		this.getInvokeID = function() {
			return getNextInvokeID();
		}

		/*
		 * public function to get the sessionID
		 */
		this.getSessionID = function() {
			return sessionID;
		}

		/*
		 * return state of socket connection (true if connected, false if not connected or ON connecting)
		 */
		this.getConnectionState = function() {
			if(tcpConnection != null) {
				return !tcpConnection.pending;
			}
			return null;
		}
	// ###### END - some help methods ######
	}
}
