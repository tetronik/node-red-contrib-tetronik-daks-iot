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
	function DaksProcessEvaluationNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
		this.topic = config.topic;
        this.name = config.name;
        this.eventItem = RED.nodes.getNode(config.eventItem);
        this.confirmation = config.confirmation;
		
		var that = this;

        var node = this;
        
        node.on('input', function(msg) {
            if(msg.msgtype == "response") {
                if(checkID(msg)) {
                    var output = {};

                    if(msg.type == "group") {
                        output.endReason = msg.payload.result;
                    } else {
                        output.state = msg.payload.state;
                    }
                    output.result = msg.payload.result;
                    if(this.confirmation == true) {
                        if(output.result == "Positive confirmed" || output.result == "Negative confirmed") {
                            output.payload = "Confirmed";
                        } else if(output.result == "Positive" || output.result == "Negative") {
                            output.payload = "Denied";
                        } else {
                            output.payload = "ERR";
                        }
                    }

                    node.send(output);
                }
            }
        });

        node.on('close', function(done) {
            if(this.log) {
                done();
            }
        });

        this.on('close', function(done) {
            done();
        });
		
		function checkID(msg) {
			try {
				if(typeof msg.payload.event_id != 'undefined') {
					if(typeof msg.payload.event_id == 'string') {
						if(msg.payload.event_id == that.eventItem.id) {
							return true;
						}
					} else if(typeof msg.payload.event_id == 'object') {
						if(msg.payload.event_id.id == that.eventItem.id) {
							return true;
						}
					}
				}
			} catch(err) {
				node.debug({payload: "Error-Code: 27c0bf8d", err: err, msg: msg});
			}
			return false;
		}        
	}
    RED.nodes.registerType("t-daks process-evaluation",DaksProcessEvaluationNode);
}
