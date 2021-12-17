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

	function MiscStringToArrayFilter(config) {
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
		this.topic = config.topic;
        this.name = config.name;
        
		this.skipUntilLetter = config.skipUntilLetter || false;	// = true
		this.label = config.label;

		var items = new Array(this.numItems);

		for(var i=0; i<this.label.length; i++) {
			items[i] = {};
			items[i].value = config.label[i].value;
			items[i].separator = config.label[i].separator;
		}

		var i = 0;

		var node = this;
		        

        node.on('input', function(msg) {
			// search for split patterns and split message
			// the last item is every time the rest of the message, after the penultimate item

			var output = new Array(this.label.length);

			var inMsg = msg.payload;
			var firstChar = 0;
			var outputIndex = 0;

			for(i = 0 ; i < inMsg.length ; i++) {
				if((outputIndex+1) == items.length) {
					var tmp = inMsg.substring(firstChar, inMsg.length);
					tmp = skipSeparatorUntilLetter(tmp, node, items, outputIndex);
					output[outputIndex] = tmp;
					break;
				}

				var checkSeparatorItem = checkSeparator(inMsg, i, items[outputIndex].separator);

				if(checkSeparatorItem) {
					var tmp = inMsg.substring(firstChar, i);
					tmp = skipSeparatorUntilLetter(tmp, node, items, outputIndex);
					output[outputIndex] = tmp;
					firstChar = i + convertChar(items[outputIndex].separator).length;
					i += (convertChar(items[outputIndex].separator).length - 1);
					outputIndex++;
				}
			}

			//#################################
			// generate labeled JSON-SubObjects with the elements from the input

			msg.split = {};
			for(i = 0 ; i < output.length ; i++) {
			    msg.split[items[i].value] = output[i];
			}

			//#################################
			// return message flow

			node.send(msg);
        });

        this.on('close', function(done) {
            done();
        });

	}
	RED.nodes.registerType("t-misc string-to-array-filter",MiscStringToArrayFilter);

	function convertChar(original) {
		switch(original) {
			case "\\0":
				return String.fromCharCode(0x00);
			case "\\a":
				return String.fromCharCode(0x07);
			case "\\b":
				return String.fromCharCode(0x08);
			case "\\t":
				return String.fromCharCode(0x09);
			case "\\n":
				return String.fromCharCode(0x0A);
			case "\\v":
				return String.fromCharCode(0x0B);
			case "\\f":
				return String.fromCharCode(0x0C);
			case "\\r":
				return String.fromCharCode(0x0D);
			case "\\e":
				return String.fromCharCode(0x1B);
			default:
				return original;			
		}
	}

	function checkSeparator(tmpChar, startIndex ,separator = "") {
		if(((tmpChar.substring(startIndex)).startsWith(separator)) || (tmpChar[startIndex].charCodeAt(0) == (convertChar(separator)).charCodeAt(0))) {
			return true;
		}
		return false;
	}

	function skipSeparatorUntilLetter(tmp, node, items, outputIndex) {
		if(node.skipUntilLetter && outputIndex > 0) {
			var while_loop = true;
			while(while_loop) {
				var test = checkSeparator(tmp, 0, items[outputIndex-1].separator);
				if(test) {
					tmp = tmp.substring(1, tmp.length);
				} else {
					while_loop = false;
				}
			}
		}
		return tmp;
	}
}