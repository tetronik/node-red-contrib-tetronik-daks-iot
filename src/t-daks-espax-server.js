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
		node.lastNodeStatus = {};
		node.login_failed = [false, false];
		node.queue = [];	// Process Queue
		node.max_age = 1;	// in minutes
		node.socketErrorMessage = false;
		node.context.state = 0;	//Server states for client handling and state message in NodeRed

		updateFile(node, true);	// read old queue data from file

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
			node.debug({payload: "Error-Code: 2956165a", err: err, msg: msg});
            tLog(node, err, 'ERROR');
        }
	
		// setup master and slave config objects
		var configMain = {ip: this.host_main, port: this.port_main, usessl: this.usessl_main, validate_certificate: this.validate_certificate_main, user: this.user_main, pwd: this.password_main, client: this.client_main, sw: sVersion, name: this.name_main};
		var configSlave = {ip: this.host_slave, port: this.port_slave, usessl: this.usessl_slave, validate_certificate: this.validate_certificate_slave, user: this.user_slave, pwd: this.password_slave, client: this.client_slave, sw: sVersion, name: this.name_slave};

		// define master and slave connections
		node.hotStandBy = 0;
		node.hotStandBy_master_active = true;
		node.hotStandBy_slave_active = true;
		node.connection = {};
		node.connection[0] = new EspaXConnection(node, configMain, true, net_1, tls_1);	// predefine an espa-x MAIN connection
		// only define slave if defined
		if(this.have_slave == "slave") {
			node.connection[1] = new EspaXConnection(node, configSlave, false, net_2, tls_2);	// predefine an espa-x SLAVE connection
		}

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

		/// EVENT-LISTENER
		/*
		 * Input data for the queue
		 */
		node.addListener('MessageToQueue', function(msg) {

			if(!msg.again) {
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
							'DAKS_ESPA-X': { $: {version: "1.14", xmlns:"http://ns.tetronik.com/DAKS_ESPA-X", 'xsi:schemaLocation':"http://ns.tetronik.com/DAKS_ESPA-X http://schema.tetronik.com/DAKS/DAKS_ESPA-X114.xsd"},
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
	function handleQueueData(node) {
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
										if(node.queue[i].used_connection == 0) {
											node.queue[i].used_connection = 1;
											node.queue[i].again = true;
											node.emit("MessageToQueue", node.queue[i]);
										} else if(node.queue[i].used_connection == 1) {
											node.queue[i].used_connection = 0;
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
						node.debug({payload: "Error-Code: f89435fa", err: err});
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
			// hotStandBy 0=master operation |1=slave operation
			if(node.hotStandBy == 0) {
				// no master, but slave
				if(!node.connection[0].getConnectionState() && node.connection[1].getConnectionState()) {
					node.hotStandBy = 1;
					tLog(node, "Switched connection to ESPA-X Slave", 'WARNING');
					updateNodeStatus(node, "yellow", "dot", "Connected to Slave");
					ctrlFrontLed(node,"yellow");
				}
				// both
				else if(node.connection[0].getConnectionState() && node.connection[1].getConnectionState()) {
					updateNodeStatus(node, "green", "dot", "Connected to Master");
					ctrlFrontLed(node,"green");
				}
				// master, but no slave
				else if(node.connection[0].getConnectionState() && !node.connection[1].getConnectionState()){
					tLog(node, "ESPA-X Slave is not available.", 'WARNING');
					updateNodeStatus(node, "yellow", "dot", "Connected to Master");
					ctrlFrontLed(node,"yellow");
				}
				// none
				else if(!node.connection[0].getConnectionState() && !node.connection[1].getConnectionState()) {
					tLog(node, "Connection ERROR, no ESPA-X Master or Slave are available!", 'ALARM');
					updateNodeStatus(node, "red", "dot", "Connection ERROR");
					ctrlFrontLed(node,"red");
				}
			} else {
				// master, but no slave
				if(node.connection[0].getConnectionState() && !node.connection[1].getConnectionState()) {
					node.hotStandBy = 1;
					tLog(node, "Returned to ESPA-X Master.", 'INFO');
					tLog(node, "ESPA-X Slave is not available.", 'WARNING');
					updateNodeStatus(node, "yellow", "dot", "Connected to Master");
					ctrlFrontLed(node,"yellow");
				}
				// both
				else if(node.connection[0].getConnectionState() && node.connection[1].getConnectionState()) {
					tLog(node, "Returned to ESPA-X Master.", 'INFO');
					updateNodeStatus(node, "green", "dot", "Connected to Master");
					ctrlFrontLed(node,"green");
					node.hotStandBy = 0;
				}
				// no master, but slave
				else if(!node.connection[0].getConnectionState() && node.connection[1].getConnectionState()){
					tLog(node, "Returned to ESPA-X Slave.", 'INFO');
					tLog(node, "ESPA-X Master is not available.", 'WARNING');
					updateNodeStatus(node, "yellow", "dot", "Connected to Slave");
					ctrlFrontLed(node,"yellow");
				}
				// none
				else if(!node.connection[0].getConnectionState() && !node.connection[1].getConnectionState()) {
					tLog(node, "Connection ERROR, no ESPA-X Master or Slave are available!", 'ALARM');
					updateNodeStatus(node, "red", "dot", "Connection ERROR");
					ctrlFrontLed(node,"red");
				}
			}
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
	}
	
	/*
	 * Check for Kunbus Revolution-Pi and control LED A3
	 */
	function ctrlFrontLed(node, color) {
		var check = process.env.isKunbus || null;
		if(check == "isTetronik") {
			switch(color) {
				case "green":
					setFrontLedColor(node,2,1);
					setFrontLedColor(node,3,0);
					break;
				case "yellow":
					setFrontLedColor(node,2,1);
					setFrontLedColor(node,3,1);
					break;
				case "red":
					setFrontLedColor(node,2,0);
					setFrontLedColor(node,3,1);
					break;
				case "off":
				default:
					setFrontLedColor(node,2,0);
					setFrontLedColor(node,3,0);
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
				shellExec(node, "gpio write " + pin + " " + state);
				break;
			case "buster-raspi-gpio":
				var pinState = "dl";
				if(state == 1) {
					pinState = "dh";
				}
				shellExec(node, "raspi-gpio set " + pin + " " + pinState);
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
    
        if(read) {
            var lineReader = require('readline');
        
            async function readLineByLine() {
                const file = fs.createReadStream('queue_'+node.name+'.fifo');
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
        
            if(fs.existsSync('queue_'+node.name+'.fifo')) {
                readLineByLine();
            }
        
        } else {
            var file = fs.createWriteStream('queue_'+node.name+'.fifo');
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
							error = "Invalid header";
						}
						break;
					case 1:
						if(buffer[i] == 'X'.charCodeAt()) {
							position++;
						} else {
							error = "Invalid header";
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
		
		// timers
		var reConnectTimeout = 5;	// in seconds
		var reConnectTimeoutObj = null;
		var heartbeatTimer = null;
		
		// little eager helper
		var that = this;

		// defines socket
		var tcpConnection = new net.Socket();

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
					reConnectTimeoutObj = setTimeout(reConnectTimer, reConnectTimeout * 1000);
					
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
        var onConnected = function() {
			tLog(node, "Login to server: " + config.ip, 'INFO');
			node.debug("Encryption enabled: " + tcpConnection.encrypted);

            var invokeID = getNextInvokeID();
			
			var loginXml = {
				'ESPA-X' : { $: { version:"1.00", timestamp:(new Date()).toISOString().replace(/\..+/, '')},
                    'REQ.LOGIN': { $: {invokeID: invokeID},
                        'LI-CLIENT': config.client,
                        'LI-CLIENTSW': config.sw,
                        'LI-USER': config.user,
						'LI-PASSWORD': config.pwd,
                    }
                }
			};

            that.sendRequest(invokeID, loginXml);
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

			var invokeID;
			try {
				invokeID = parseInt(cmdParams.$["invokeID"]);
			} catch(err) {

			}

			// checks, if input data has an active process in nodered
			if(invokeID != undefined) {
				var req = pullRequest(invokeID);

				if(cmdName.substr(0,3) == "CMD" && that.onCommand != null) {
					that.onCommand(cmdName, cmdParams);
				} else {
					if(req == null && cmdName.substr(0,3) != "IND") {
						tLog(node, "No corresponding request found for invokeID=" + invokeID, 'WARNING');
					}
					that.onResponse(cmdName, cmdParams, req);
				}
			} else if(that.onCommand != null) {
				that.onCommand(cmdName, cmdParams);
			}
		}

		/// EVENT-LISTENER
		/*
		 * does some action, depending on input message
		 * not all espa-x attributes are supported
		 */
		this.onResponse = function(name, params, req) {
			switch(name) {
				// login response (logged in or error)
				case "RSP.LOGIN":
					var rspCode = parseInt(params["RSP-CODE"]);
					tLog(node, "Response >> Login.", 'INFO');
					if(rspCode == 200) {
						try {
							
							sessionID = params.$["sessionID"];

							// Check, if ESPA-X Server is a DAKS
							var allowedDevices = ["DAKS-Pro","eco-","med-","alert-"];
							var serversw = params["LI-SERVERSW"][0];
							var checkOK = false;
							
							/*var check = process.env.isKunbus || null;
							if(check == "isTetronik") {
								var kunbusAllowedDevices = ["TIIP"];
								allowedDevices = allowedDevices.concat(kunbusAllowedDevices);
							}*/


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
				
				// process start response (gives further information, if the process started or rejected with any problems)
				case "RSP.P-START":
					var rspCode = parseInt(params["RSP-CODE"]);
					var ref = params["CP-PR-REF"];
					var tan = parseInt(params["SP-PR-TAN"]);
					tLog(node, "Response >> START. Reference: " + ref, 'INFO');

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
										if(node.connection[0] != undefined && node.connection[1] != undefined) {
											if(node.queue[i].used_connection == 0 && node.connection[1].getConnectionState()) {
												node.queue[i].used_connection = 1;
											} else if(node.queue[i].used_connection == 1 && node.connection[0].getConnectionState()) {
												node.queue[i].used_connection = 0;
											}
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
										if(node.connection[0] != undefined && node.connection[1] != undefined) {
											if(node.queue[i].used_connection == 0 && node.connection[1].getConnectionState()) {
												node.queue[i].used_connection = 1;
											} else if(node.queue[i].used_connection == 1 && node.connection[0].getConnectionState()) {
												node.queue[i].used_connection = 0;
											}
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
					if(result[0] != undefined) {
						node.emit('Nodeoutput', [{"payload":{"event_id":eventId,"endReason":(endReason!=undefined)?endReason[0]:"","result":(result!=undefined)?result[0]:"","ref":ref[0],"tan":tan},"msgtype":"response","type":(type!=undefined)?type:""},null]);
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

					if(master) {
						node.hotStandBy_master_active = !(hotstby == 'true');
					} else {
						node.hotStandBy_slave_active = !(hotstby == 'true');
					}

					if(master && node.hotStandBy == 0 && !node.hotStandBy_master_active) {
						if(node.have_slave == "slave") {
							node.hotStandBy = 1;
						}
					} else if(master && node.hotStandBy == 1 && node.hotStandBy_master_active) {
						node.hotStandBy = 0;
					} else if(!master && node.hotStandBy == 1 && !node.hotStandBy_slave_active && !node.hotStandBy_master_active) {
						tLog(node, "Both DAKS-Servers are in Hot-Standby mode.", 'CRITICAL');
						node.warn("Both DAKS-Servers are in Hot-Standby mode.");
					}

					tLog(node, "Servercondition >> Response-Code: " + rspCode + ", Response-Reason: " + rspReason + ", Server-Health: " + health + ", Hot-Standby: " + hotstby + ", Server-Load: " + load, 'INFO');
					break;

				case "IND.S-SYSTEM":
					var health = params["S-HEALTH"];
					var hotstby = params["S-HOTSTBY"];
					var load = params["S-LOAD"];


					if(master) {
						node.hotStandBy_master_active = !(hotstby == 'true');
					} else {
						node.hotStandBy_slave_active = !(hotstby == 'true');
					}

					if(master && node.hotStandBy == 0 && !node.hotStandBy_master_active) {
						if(node.have_slave == "slave") {
							node.hotStandBy = 1;
						}
					} else if(master && node.hotStandBy == 1 && node.hotStandBy_master_active) {
						node.hotStandBy = 0;
					} else if(!master && node.hotStandBy == 1 && !node.hotStandBy_slave_active && !node.hotStandBy_master_active) {
						tLog(node, "Both DAKS-Servers are in Hot-Standby mode.", 'CRITICAL');
						node.warn("Both DAKS-Servers are in Hot-Standby mode.");
					}

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