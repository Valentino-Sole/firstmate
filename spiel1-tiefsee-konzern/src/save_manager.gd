class_name SaveManager
extends RefCounted

## Speichert und lädt den Spielstand als JSON unter user://.
## Beim Laden wird der Offline-Fortschritt seit dem letzten Speichern gutgeschrieben.

const SAVE_PATH := "user://save.json"


static func save_game(eco) -> bool:
	var payload := {
		"saved_at": Time.get_unix_time_from_system(),
		"economy": eco.to_dict(),
	}
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload))
	file.close()
	return true


static func load_game(eco) -> Dictionary:
	var result := {"loaded": false, "offline_seconds": 0.0, "offline_gain": 0.0}
	if not FileAccess.file_exists(SAVE_PATH):
		return result
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return result
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return result
	var economy_data = parsed.get("economy", {})
	if typeof(economy_data) != TYPE_DICTIONARY:
		return result
	eco.from_dict(economy_data)
	result["loaded"] = true
	var saved_at := float(parsed.get("saved_at", 0.0))
	if saved_at > 0.0:
		var away: float = max(Time.get_unix_time_from_system() - saved_at, 0.0)
		result["offline_seconds"] = away
		result["offline_gain"] = eco.offline_gain(away)
	return result


static func clear_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(SAVE_PATH)
