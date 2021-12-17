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

	function DaksEventIdDefinitionNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.name = config.name;
		this.custom_enabled = config.custom_enabled;
        this.custom = config.custom;
        
        var id_items;
        var node = this;

        if(this.custom_enabled) {
            id_items = new Array(config.custom.length);
            for(var i = 0; i < id_items.length; i++) {
                id_items[i] = config.custom[i].value;
            }
        }
        
        node.addListener('RequestID', function(msg) {
            if(this.custom_enabled) {
                // generate CUSTOM ID
                msg.event_id = {};
                msg.event_id.id = config.id;
                msg.event_id.custom = new Array(id_items.length);

                for(var i = 0; i<id_items.length; i++) {
                    msg.event_id.custom[i] = RED.util.getMessageProperty(msg,id_items[i]);
                }

            } else {
                msg.event_id = config.id;
            }
            node.emit("GetID", msg);
        });

        this.on('close', function(done) {
            done();
        });
        
	}
    RED.nodes.registerType("t-daks event-id_definition",DaksEventIdDefinitionNode);
}
