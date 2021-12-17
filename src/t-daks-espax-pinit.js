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

	function DaksEspaxProcessInitNode(config) {
        RED.nodes.createNode(this,config);
        
        this.payload = config.payload;
		this.topic = config.topic;
		this.name = config.name;
		this.logging = RED.nodes.getNode(config.logging);
        
        this.action = config.action;
		this.ptype = config.ptype;
		this.number = config.number;
		this.conntype = config.conntype;
		this.calling_number = config.calling_number;
		this.calling_name = config.calling_name;
		this.message = config.message;
		this.ward = config.ward;
		this.bed = config.bed;
		this.signal = config.signal;
		this.delay = config.delay;
		this.attempts = config.attempts;
		this.callback = config.callback;
		this.prio = config.prio;
		this.pr_details = config.pr_details;
		this.audio_id = config.audio_id;
		this.max_age = config.max_age;
		this.ncifno = config.ncifno;
		this.cbckno = config.cbckno;

		this.ptype_S = config.ptype_S;
		this.number_S = config.number_S;
		this.conntype_S = config.conntype_S;
		this.calling_number_S = config.calling_number_S;
		this.calling_name_S = config.calling_name_S;
		this.message_S = config.message_S;
		this.ward_S = config.ward_S;
		this.bed_S = config.bed_S;
		this.signal_S = config.signal_S;
		this.delay_S = config.delay_S;
		this.attempts_S = config.attempts_S;
		this.callback_S = config.callback_S;
		this.prio_S = config.prio_S;
		this.audio_id_S = config.audio_id_S;
		this.max_age_S = config.max_age_S;
		this.ncifno_S = config.ncifno_S;
		this.cbckno_S = config.cbckno_S;
		this.confirmation_S = config.confirmation_S;
		this.mask_S = config.mask_S;
		this.reason_S = config.reason_S;

		this.confirmation = config.confirmation;
		this.confirmation_key_0 = config.confirmation_key_0;
		this.confirmation_key_1 = config.confirmation_key_1;
		this.confirmation_key_2 = config.confirmation_key_2;
		this.confirmation_key_3 = config.confirmation_key_3;
		this.confirmation_key_4 = config.confirmation_key_4;
		this.confirmation_key_5 = config.confirmation_key_5;
		this.confirmation_key_6 = config.confirmation_key_6;
		this.confirmation_key_7 = config.confirmation_key_7;
		this.confirmation_key_8 = config.confirmation_key_8;
		this.confirmation_key_9 = config.confirmation_key_9;

		this.confirmation_label_0 = config.confirmation_label_0;
		this.confirmation_label_1 = config.confirmation_label_1;
		this.confirmation_label_2 = config.confirmation_label_2;
		this.confirmation_label_3 = config.confirmation_label_3;
		this.confirmation_label_4 = config.confirmation_label_4;
		this.confirmation_label_5 = config.confirmation_label_5;
		this.confirmation_label_6 = config.confirmation_label_6;
		this.confirmation_label_7 = config.confirmation_label_7;
		this.confirmation_label_8 = config.confirmation_label_8;
		this.confirmation_label_9 = config.confirmation_label_9;
		

		this.confirmation_ann = config.confirmation_ann;
		this.confirmation_text = config.confirmation_text;

		this.cmd = config.cmd;
		this.mask = config.mask;
		this.reason = config.reason;

		var node = this;
		        

        node.on('input', function(msg) {
			if(msg.event_id == undefined || msg.event_id == "" || msg.event_id == null) {
				tLog(node, "Your node \"" + node.id + "\" needs a \"Event-ID\"-Node in front, to proceed with your message! Your message has been rejected!", 'ERROR');
				node.status({fill: "red", shape: "dot", text: "Event-ID is missing! Message was rejected!"});
				return;
			}
			node.status({});	// clear status

			switch(this.action) {
				case "start":
					msg.espax = {};

					if(this.ptype_S != "t") {
						msg.espax.type = msg.ptype;
						if(msg.espax.type != "single" && msg.espax.type != "group") {
							tLog(node, "The recieved \"Call-Type\" is not valid. The message will be rejected. Message: " + msg.espax.type, 'ERROR');
							return;
						}
					} else {
						msg.espax.type = this.ptype;
					}

					if(this.number_S != "t") {
						if(((msg.espax.type == "single" && /^[\\0-9+\-()/*#,;.]*$/.test(msg.number))) || ((msg.espax.type == "group" && /^[0-9]*$/.test(msg.number)))) {
							msg.espax.number = msg.number;
							if(msg.espax.number.length > 24 && msg.espax.type == "single") {
								tLog(node, "The received \"Number\" was too long. It will be shortened to 24 characters.", 'WARNING');
								msg.espax.number = msg.espax.number.substring(0,24);
							} else if(msg.espax.number.length > 12 && msg.espax.type == "group") {
								tLog(node, "The received \"Group ID\" was too long. It will be shortened to 12 characters.", 'WARNING');
								msg.espax.number = msg.espax.number.substring(0,12);
							}
						} else {
							tLog(node, "The reveived \"Number\" was not valid and will be rejected! Message: " + msg.number, 'ERROR');
							return;
						}
					} else {
						msg.espax.number = this.number;
					}
					
					if(this.conntype_S != "t") {
						if(msg.espax.type == "single") {
							msg.espax.conntype = msg.conntype;
							if(msg.espax.conntype.length > 3 && msg.espax.type == "single") {
								tLog(node, "The received \"Connection-Type\" was too long and will be rejected!", 'Error');
								return
							}
						}
					} else {
						msg.espax.conntype = this.conntype;
					}
					
					

					if(this.calling_number_S != "t") {
						if(/^[0-9*#]*$/.test(msg.calling_number)) {
							msg.espax.calling_number = msg.calling_number;
							if(msg.espax.calling_number.length > 16) {
								tLog(node, "The received \"Calling Number\" was too long. It will be shortened to 16 characters.", 'WARNING');
								msg.espax.calling_number = msg.espax.calling_number.substring(0,16);
							}
						} else {
							tLog(node, "The reveived \"Caller-Number\" was not valid and will be rejected! Message: " + msg.espax.calling_number, 'ERROR');
							return;
						}
					} else {
						msg.espax.calling_number = this.calling_number;
					}
					

					if(this.calling_name_S != "t") {
						msg.espax.calling_name = msg.calling_name;
						if(msg.espax.calling_name.length > 24) {
							tLog(node, "The received \"Caller Name\" was too long. It will be shortened to 24 characters.", 'WARNING');
							msg.espax.calling_name = msg.espax.calling_name.substring(0,24);
						}
					} else {
						msg.espax.calling_name = this.calling_name;
					}

					if(this.message_S != "t") {
						msg.espax.message = msg.message;
						if(msg.espax.message.length > 250) {
							tLog(node, "The received \"Message\" was too long. It will be shortened to 250 characters.", 'WARNING');
							msg.espax.message = msg.espax.message.substring(0,250);
						}
					} else {
						msg.espax.message = this.message;
					}

					if(this.ward_S != "t") {
						msg.espax.ward = msg.ward;
						if(msg.espax.ward.length > 12) {
							tLog(node, "The received \"Ward\" was too long. It will be shortened to 12 characters.", 'WARNING');
							msg.espax.ward = msg.espax.ward.substring(0,12);
						}
					} else {
						msg.espax.ward = this.ward;
					}

					if(this.bed_S != "t") {
						msg.espax.bed = msg.bed;
						if(msg.espax.bed.length > 12) {
							tLog(node, "The received \"Bed\" was too long. It will be shortened to 12 characters.", 'WARNING');
							msg.espax.bed = msg.espax.bed.substring(0,12);
						}
					} else {
						msg.espax.bed = this.bed;
					}

					if(this.signal_S != "t") {
						msg.espax.signal = msg.signal;
						if(msg.espax.signal != "Standard" && msg.espax.signal != "Urgent" && msg.espax.signal != "Emergency") { // && msg.espax.signal != "Special") {
							tLog(node, "The recieved \"Signal\" is not valid. The signal changed to default: Standard.", 'WARNING');
							msg.espax.signal = "Standard";
						}
					} else {
						msg.espax.signal = this.signal;
					}

					if(this.delay_S != "t") {
						msg.espax.delay = parseInt(msg.delay);
						if(isNaN(msg.espax.delay)) {
							tLog(node, "The received \"Delay\"-value is not a number. The \"Delay\"-value is now set to default: 0.", 'WARNING');
							msg.espax.delay = 0;
						} else if(msg.espax.delay < 0 || msg.espax.delay > 65535) {
							tLog(node, "The received \"Delay\"-value was out of range. It has to be between 0 and 65535. The \"Delay\"-value is now set to default: 0",'WARNING');
							msg.espax.delay = 0;
						}

						msg.espax.delay += "";
					} else {
						msg.espax.delay = this.delay;
					}

					if(this.attempts_S != "t") {
						msg.espax.attempts = parseInt(msg.attempts);
						if(isNaN(msg.espax.attempts)) {
							tLog(node, "The received \"Attempts\" is not a number. The \"Attempts\"-value is now set to default: 1.", 'WARNING');
							msg.espax.attempts = 1;
						} else if(msg.espax.attempts < 0 || msg.espax.attempts > 65535) {
							tLog(node, "The received \"Attempts\"-value was out of range. It has to be between 0 and 65535. The \"Attempts\"-value is now set to default: 1",'WARNING')
							msg.espax.attempts = 1;
						}

						msg.espax.attempts += "";
					} else {
						msg.espax.attempts = this.attempts;
					}

					if(this.callback_S != "t") {
						msg.espax.callback = msg.callback;
						if(msg.espax.callback != "No" && msg.espax.callback != "NC-IF" && msg.espax.callback != "NC-IF-DTMF" && msg.espax.callback != "NC-IF-DTHRU" && msg.espax.callback != "NC-IF-PREP" && msg.espax.callback != "Phone" && msg.espax.callback != "Phone-VC") {
							tLog(node, "The recieved \"Callback\" is not valid. The callback is changed to default: No.", 'WARNING');
							msg.espax.callback = "No";
						}
					} else {
						msg.espax.callback = this.callback;
					}
					
					if(this.prio_S != "t") {
						msg.espax.prio = msg.prio;
						if(msg.espax.prio != "Emergency" && msg.espax.prio != "High" && msg.espax.prio != "Medium" && msg.espax.prio != "Standard" && msg.espax.prio != "Low") {
							tLog(node, "The recieved \"Priority\" is not valid. The signal is changed to default: Standard.", 'WARNING');
							msg.espax.prio = "Standard";
						}
					} else {
						msg.espax.prio = this.prio;
					}

					msg.espax.pr_details = this.pr_details;	// NEVER CHANGE

					if(this.audio_id_S != "t") {
						if(msg.audio_id == "" || typeof msg.audio_id == 'undefined') {
							if(msg.espax.type == "single") {
								tLog(node, "The \"Audio-ID\" is required for single calls! Message: " + msg.espax.audio_id, 'ERROR');
								return;
							}
						} else if(/^(\d{1,4})(([ ]\d{1,4}){0,15})$/.test(msg.audio_id)) {
							msg.espax.audio_id = msg.audio_id;
						} else {
							tLog(node, "The reveived \"Audio-ID\"-String was not valid and will be rejected! Message: " + msg.espax.audio_id, 'ERROR');
							return;
						}
					} else {
						msg.espax.audio_id = this.audio_id;
					}

					if(this.max_age_S != "t") {
						msg.espax.max_age = parseInt(msg.max_age);
						if(isNaN(msg.espax.max_age)) {
							tLog(node, "The received \"Max-Age\"-value is not a number. The \"Max-Age\"-value is now set to default: 1.", 'WARNING');
							msg.espax.max_age = 60;
						} else if(msg.espax.max_age < 1 || msg.espax.max_age > 1440) {
							tLog(node, "The received \"Max-Age\"-value was out of range. It has to be between 1 and 1440. The \"Max-Age\"-value is now set to default: 1",'WARNING')
							msg.espax.max_age = 60;
						}

						msg.espax.max_age += "";
					} else {
						msg.espax.max_age = this.max_age;
					}

					if(this.ncifno_S != "t") {
						msg.espax.ncifno = msg.ncifno;
						if(msg.espax.ncifno.length > 24) {
							tLog(node, "The received \"NCIFNO\"-value was too long. It will be trimmed to 24 characters.", 'WARNING');
							msg.espax.ncifno = msg.espax.ncifno.substring(0,24);
						}
					} else {
						msg.espax.ncifno = this.ncifno;
					}

					if(this.cbckno_S != "t") {
						if(/^[\\0-9+\-()/*#,;.]*$/.test(msg.cbckno)) {
							msg.espax.cbckno = msg.cbckno;
							if(msg.espax.cbckno.length > 24) {
								tLog(node, "The received \"Callback Number\" was too long. It will be trimmed to 24 characters.", 'WARNING');
								msg.espax.cbckno = msg.espax.cbckno.substring(0,24);
							}
						} else {
							tLog(node, "The reveived \"Callback number\" was not valid and will be rejected! Message: " + msg.espax.cbckno, 'ERROR');
							return;
						}
					} else {
						msg.espax.cbckno = this.cbckno;
					}


					if(this.confirmation_S != "t") {
						if(msg.confirmation != undefined) {
							if(msg.confirmation.ann != undefined) {
								msg.confirmation.ann = parseInt(msg.confirmation.ann);
								if(isNaN(msg.confirmation.ann)) {
									tLog(node, "The received \"Confirmation-Announcement-ID\" is not a number. The \"Confirmation-Announcement-ID\" is now removed.", 'WARNING');
									msg.confirmation.ann = "";
								} else if(msg.confirmation.ann < 0 || msg.confirmation.ann > 9999) {
									tLog(node, "The received \"Confirmation-Announcement-ID\" was out of range. The \"Confirmation-Announcement-ID\" is now removed.", 'WARNING');
									msg.confirmation.ann = "";
								}

								msg.confirmation.ann += "";
							} else {
								msg.confirmation.ann = "";
							}

							if(msg.confirmation.text != undefined) {
								if(msg.confirmation.text.length > 24) {
									tLog(node, "The received \"Confirmation-Display-Text\" was too long. It will be trimmed to 24 characters.", 'WARNING');
									msg.confirmation.text = msg.confirmation.text.substring(0,24);
								}
							} else {
								msg.confirmation.text = "";
							}

							if(!Array.isArray(msg.confirmation.k)) {
								msg.confirmation.k = new Array();
							}

							if(!Array.isArray(msg.confirmation.k)) {
								msg.confirmation.l = new Array();
							}

							for(var i = 0; i<10; i++) {
								if(msg.confirmation.k[i] != "None" && msg.confirmation.k[i] != "Positive" && msg.confirmation.k[i] != "Negative" && msg.confirmation.k[i] != "Wrong Person" && msg.confirmation.k[i] != "Callback" && msg.confirmation.k[i] != "Positive+Time") {
									msg.confirmation.k[i] = "None";
								} else {
									msg.confirmation.k[i] = msg.confirmation.k[i];
								}

								if(typeof msg.confirmation.l[i] == 'undefined' || msg.confirmation.l[i] == "") {
									msg.confirmation.l[i] = "None";
								} else {
									if(msg.confirmation.l[i].length > 10) {
										tLog(node, "The received \"Confirmation-Key-Label\" was too long. It will be trimmed to 10 characters.", 'WARNING');
										msg.confirmation.l[i] = msg.confirmation.l[i].substring(0,10);
									}
									msg.confirmation.l[i] = msg.confirmation.l[i];
								}
							}
						}
					} else {
						if(this.confirmation == "true") {
							msg.confirmation = {};
							msg.confirmation.k = new Array();
							msg.confirmation.k[0] = this.confirmation_key_0;
							msg.confirmation.k[1] = this.confirmation_key_1;
							msg.confirmation.k[2] = this.confirmation_key_2;
							msg.confirmation.k[3] = this.confirmation_key_3;
							msg.confirmation.k[4] = this.confirmation_key_4;
							msg.confirmation.k[5] = this.confirmation_key_5;
							msg.confirmation.k[6] = this.confirmation_key_6;
							msg.confirmation.k[7] = this.confirmation_key_7;
							msg.confirmation.k[8] = this.confirmation_key_8;
							msg.confirmation.k[9] = this.confirmation_key_9;

							msg.confirmation.l = new Array();
							msg.confirmation.l[0] = this.confirmation_label_0;
							msg.confirmation.l[1] = this.confirmation_label_1;
							msg.confirmation.l[2] = this.confirmation_label_2;
							msg.confirmation.l[3] = this.confirmation_label_3;
							msg.confirmation.l[4] = this.confirmation_label_4;
							msg.confirmation.l[5] = this.confirmation_label_5;
							msg.confirmation.l[6] = this.confirmation_label_6;
							msg.confirmation.l[7] = this.confirmation_label_7;
							msg.confirmation.l[8] = this.confirmation_label_8;
							msg.confirmation.l[9] = this.confirmation_label_9;

							msg.confirmation.ann = this.confirmation_ann;
							msg.confirmation.text = this.confirmation_text;
						}
					}

					break;
				
				case "stop":
					msg.cmd = "stop";
					if(this.mask_S != "t") {
						if(msg.mask != "Prepared" && msg.mask != "Queued" && msg.mask != "Active" && msg.mask != "Conversation" && msg.mask != "Postprocessing" && msg.mask != "All") {
							tLog(node, "The recieved \"Priority\" is not valid. The signal changed to default: All.", 'WARNING');
							msg.mask = "All";
						}
					} else {
						msg.mask = this.mask;
					}
					break;

				case "logout":
					msg.cmd = "logout";
					if(this.reason_S != "t") {
						if(msg.reason != "Normal" && msg.reason != "Service" && msg.reason != "Reboot" && msg.reason != "New data" && msg.reason != "System error" && msg.reason != "Requested" && msg.reason != "Unspecified") {
							tLog(node, "The recieved \"Priority\" is not valid. The signal changed to default: Normal.", 'WARNING');
							msg.reason = "Normal";
						}
					} else {
						msg.reason = this.reason;
					}
					break;

				case "condition":
					msg.cmd = "condition";
					break;

				default:
					tLog(node, "You selected an invalid action! The process will be rejected!", 'ERROR');
					return;
			}

			node.send(msg);
        });

        this.on('close', function(done) {
            done();
        });

	}
	RED.nodes.registerType("t-daks espax process-init",DaksEspaxProcessInitNode);

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