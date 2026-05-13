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

	function DaksLogInputNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
        this.topic = config.topic;
		this.log = RED.nodes.getNode(config.log);
        this.name = config.name;
        
        this.message = config.message;
        this.level = config.level;
        this.location = config.location;

        this.message_S = config.message_S;
        this.level_S = config.level_S;
        this.location_S = config.location_S;
        

        var node = this;
    
        node.on('input', function(msg) {
            var out = {};

            if(this.message_S != "t") {
                out.payload = msg.payload;
            } else {
                out.payload = this.message;
            }

            if(this.level_S != "t") {
                const level = (msg.level || "INFO").toString().toUpperCase();
                out.level = ["INFO","WARNING","ERROR","CRITICAL","ALARM"].includes(level) ? level : "INFO";
            } else {
                out.level = this.level;
            }

            if(this.location_S != "t") {
                out.location = msg.location;
            } else {
                out.location = this.location;
            }

            if(node.log) {
                node.log.emit('getData', out);
            } else {
                node.warn("No Log-Connector defined");
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
        
	}
    RED.nodes.registerType("t-daks log-input",DaksLogInputNode);
}
