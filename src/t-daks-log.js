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

	function DaksLogNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
		this.topic = config.topic;
		this.log = RED.nodes.getNode(config.log);
        this.name = config.name;
        this.console = config.console;

        var node = this;
        
        if(this.log) {
            node.log.addListener('logData', function(msg) {
                node.send(msg);
                
                if(node.console) {
                    if(typeof msg.level === 'undefined') {
                        msg.level = "INFO";
                    }
                    if(typeof msg.location === 'undefined') {
                        msg.location = "Node";
                    }

                    this.log(msg.location + " [" + msg.level + "]: " + msg.payload);
                }
            });

        } else {
            node.warn("No Log-Connector defined");
        }

        node.on('close', function(done) {
            if(this.log) {
                done();
            }
        });

        this.on('close', function(done) {
            done();
        });
        
	}
    RED.nodes.registerType("t-daks log",DaksLogNode);
}
