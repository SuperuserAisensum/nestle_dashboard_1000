import sqlite3

# Koneksi ke database
conn = sqlite3.connect("nestle_iot.db")
cursor = conn.cursor()

# Hapus data dengan device_id 'raspberry_pi_zero'
cursor.execute("DELETE FROM detection_events WHERE device_id = ?", ("raspberry_pi_zero",))

# Simpan perubahan dan tutup koneksi
conn.commit()
conn.close()

print("Data berhasil dihapus.")
