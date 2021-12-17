"use strict";

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

    var uniqid = require("uniqid");

	function DaksEspaxNode(config) {
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
		this.topic = config.topic;
		this.server = RED.nodes.getNode(config.server);
		this.name = config.name;
		this.logging = RED.nodes.getNode(config.logging);

		var node = this;
		        
        if(this.server) {
			
			// get last status
			this.server.emit('getLastStatus', this);

			this.server.addListener('Nodestatus', function(msg) {
				node.status(msg);
            });
			
			this.server.addListener('InitNodestatus', function(msg) {
				var parentNode = msg.node;
				parentNode.status(msg);
            });
            
            this.server.addListener('Nodeoutput', function(msg) {
				node.send(msg);
			});

            try {
                node.on('input', function(msg) {
					delete(msg.req);
					delete(msg.req_id);
					delete(msg.res);
					delete(msg._session);
					if(typeof msg.flush != 'undefined') {
						node.server.emit('FlushQueue', {});
						return;
					}
					
                    msg.uniqid = uniqid();
                    msg.again = undefined;
                    msg.used_connection = undefined;

                    if(typeof msg.event_id != undefined && (msg.event_id == "" || msg.event_id == null)) {
                        // ERROR on eventID parameter set but empty or null
                        tLog(node, "A Event-ID was given but it was emtpy. Sent message: " + msg, 'ERROR');
                        return;
                    }

                    if(typeof msg.cmd != 'undefined') {
                        if(msg.cmd == 'logout' || msg.cmd == 'condition' || msg.cmd == 'stop') {
                            // send MSG to SERVER NODE
                            node.server.emit('Command', msg);
                        }
                    } else if(typeof msg.espax != 'undefined') {
                        if(typeof msg.espax.type == undefined || (msg.espax.type != "single" && msg.espax.type != "group" && msg.espax.type != "conference")) {
                            // ERROR on no or wrong ESPA-X command
                            tLog(node, "No or a wrong ESPA-X command was set in the msg->espax tree. Sent message: " + msg, 'ERROR');
                            return;
                        }

                        if(typeof msg.espax.number == undefined) {
                            tLog(node, "Calling number is missing. Sent message: " + msg, 'ERROR');
                            return;
                        }
						
						if(typeof msg.espax.conntype == undefined) {
                            tLog(node, "Connection-Type is missing. Sent message: " + msg, 'ERROR');
                            return;
                        }

                        if(typeof msg.espax.audio_id == undefined) {
                            tLog(node, "Audio ID is missing. Sent message: " + msg, 'ERROR');
                            return;
                        }

                        if(typeof msg.espax.calling_number == undefined) {
                            msg.espax.calling_number == "";
                        }

                        if(typeof msg.espax.calling_name == undefined) {
                            msg.espax.calling_name == "";
                        }

                        if(typeof msg.espax.message != 'undefined') {
                            if((msg.espax.message).length > 250) {
                                msg.espax.message = (msg.espax.message).substring(0,250);
                                tLog(node, "The message was too long. It is now shortened to 250 characters. Original message: " + msg.espax.message, 'WARNING');
                            }
                        } else {
                            msg.espax.message == "";
                        }

                        if(typeof msg.espax.ward != 'undefined') {
                            if((msg.espax.ward).length > 12) {
                                msg.espax.ward = (msg.espax.ward).substring(0,12);
                                tLog(node, "The ward string was too long. It is now shortened to 12 characters. Original message: " + msg.espax.ward, 'WARNING');
                            }
                        } else {
                            msg.espax.ward == "";
                        }

                        if(typeof msg.espax.bed != 'undefined') {
                            if((msg.espax.bed).length > 12) {
                                msg.espax.bed = (msg.espax.bed).substring(0,12);
                                tLog(node, "The bed string was too long. It is now shortened to 12 characters. Original message: " + msg.espax.bed, 'WARNING');
                            }
                        } else {
                            msg.espax.bed == "";
                        }

                        if(typeof msg.espax.signal == undefined || (msg.espax.signal != "Standard" && msg.espax.signal != "Urgent" && msg.espax.signal != "Emergency" && msg.espax.signal != "Special")) {
                            msg.espax.signal == "Standard";
                        }

                        if(typeof msg.espax.callback == undefined || (msg.espax.callback != "No" && msg.espax.callback != "NC-IF" && msg.espax.callback != "NC-IF-DTMF" && msg.espax.callback != "NC-IF-DTHRU" && msg.espax.callback != "NC-IF-PREP" && msg.espax.callback != "Phone" && msg.espax.callback != "Phone-VC")) {
                            msg.espax.callback == "";
                        }

                        if(typeof msg.espax.delay == 'undefined' || msg.espax.delay < 0) {
                            msg.espax.delay == 0;
                        } else if(msg.espax.delay > 65535) {
                            msg.espax.delay = 65535
                        }

                        if(typeof msg.espax.attempts == 'undefined' || msg.espax.attempts < 0) {
                            msg.espax.attempts = 0;
                        } else if(msg.espax.attempts > 65535) {
                            msg.espax.attempts = 65535
                        }

                        if(typeof msg.espax.prio == undefined || (msg.espax.prio != "Emergency" && msg.espax.prio != "High" && msg.espax.prio != "Medium" && msg.espax.prio != "Standard" && msg.espax.prio != "Low")) {
                            msg.espax.prio == "Standard";
                        }

                        if(typeof msg.espax.ncifno != 'undefined') {
                            if((msg.espax.ncifno).length > 24) {
                                msg.espax.ncifno = (msg.espax.ncifno).substring(0,24);
                                tLog(node, "The ncifno string was too long. It is now shortened to 24 characters. Original message: " + msg.espax.ncifno, 'WARNING');
                            }
                        } else {
                            msg.espax.ncifno == "";
                        }

                        if(typeof msg.espax.cbckno == undefined) {
                            msg.espax.cbckno == "";
                        }

                        if(typeof msg.espax.pr_details == undefined || (msg.espax.pr_details != "No" && msg.espax.pr_details != "Process" && msg.espax.pr_details != "Results" && msg.espax.pr_details != "All")) {
                            msg.espax.pr_details == "All";
                        }
                        

                        // send MSG to SERVER NODE
                        node.server.emit('MessageToQueue', msg);

                    } else {
                        // ERROR
                    }
                });
            } catch(err) {
                node.error(err);
            }

            this.on('close', function(done) {
                done();
            });
        } else {
            node.status({fill: "red", shape: "ring", text: "Not configured!"});
        }

	}
	RED.nodes.registerType("t-daks espax",DaksEspaxNode);
	
	function tLog(node, message, level = 'INFO', location = node.name) {
        if(node.logging) {
            var out = {};
            out.payload = message;
            out.level = level;
            out.location = location;
            node.logging.emit('getData', out);
        }
    }
}