import { useEffect } from "react";
import React = require("react");

/* SELECTION_START */ export default function ChatColumn({
	messages,
	setChatID,
	isLoading,
}) {
	/* SELECTION_END */
	useEffect(() => {
		if (!isLoading) {
			setChatID(messages[0].chatID);
		}
	}, [messages]);
	return (
		<>
			<h1>Messages</h1>
			<ul>
				{messages.map((message) => (
					<li>{message.text}</li>
				))}
			</ul>
		</>
	);
}
