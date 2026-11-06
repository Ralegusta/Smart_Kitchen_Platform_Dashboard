#include <Arduino.h>
#include <Wire.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define DHT_PIN         4
#define DHT_TYPE        DHT11
#define MQ2_PIN         34
#define SERVO_PIN       18
#define BUZZER_PIN      19
#define LED_MERAH_PIN   25
#define LED_HIJAU_PIN   26
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22

#define LEBAR_OLED      128
#define TINGGI_OLED     64
#define RESET_OLED      -1
#define ALAMAT_OLED     0x3C

const float BATAS_SUHU_C = 40.0f;   
int batasGasADC = 4000;            

const int SERVO_BUKA = 10;         
const int SERVO_TUTUP = 90;

const unsigned long WARMUP_MQ2_MS = 60000UL; 
const unsigned long INTERVAL_SENSOR_MS = 2000UL;
const unsigned long INTERVAL_OLED_MS = 500UL;
const unsigned long INTERVAL_BUZZER_MS = 250UL;

const bool BUZZER_AKTIF_HIGH = true;

DHT dht(DHT_PIN, DHT_TYPE);
Servo servoGas;
Adafruit_SSD1306 display(LEBAR_OLED, TINGGI_OLED, &Wire, RESET_OLED);

enum ModeSimulasi {
  SIM_MATI,
  SIM_GAS,
  SIM_SUHU,
  SIM_GAS_SUHU
};

enum StatusSistem {
  STATUS_WARMUP,
  STATUS_NORMAL,
  STATUS_BAHAYA_GAS,
  STATUS_BAHAYA_SUHU,
  STATUS_BAHAYA_GAS_SUHU,
  STATUS_SENSOR_ERROR,
  STATUS_TEST_GAS,
  STATUS_TEST_SUHU,
  STATUS_TEST_GAS_SUHU
};

ModeSimulasi simulasi = SIM_MATI;
StatusSistem statusSistem = STATUS_WARMUP;

float suhuC = NAN;
float kelembapan = NAN;
bool dhtValid = false;
int mq2ADC = 0;
bool oledTersedia = false;
bool servoSedangTutup = true;
bool alarmAktif = false;

unsigned long mulaiMs = 0;
unsigned long sensorMs = 0;
unsigned long oledMs = 0;

int bacaMQ2() {
  long total = 0;
  for (int i = 0; i < 8; ++i) {
    total += analogRead(MQ2_PIN);
  }
  return int(total / 8);
}

bool masihWarmup() {
  return (millis() - mulaiMs) < WARMUP_MQ2_MS;
}

void bacaSensor() {
  float suhuBaru = dht.readTemperature();
  float rhBaru = dht.readHumidity();

  dhtValid = !isnan(suhuBaru) && !isnan(rhBaru);
  if (dhtValid) {
    suhuC = suhuBaru;
    kelembapan = rhBaru;
  } else {
    suhuC = NAN;
    kelembapan = NAN;
  }
  mq2ADC = bacaMQ2();
}

void hitungStatus() {
  if (simulasi == SIM_GAS) {
    statusSistem = STATUS_TEST_GAS;
  } else if (simulasi == SIM_SUHU) {
    statusSistem = STATUS_TEST_SUHU;
  } else if (simulasi == SIM_GAS_SUHU) {
    statusSistem = STATUS_TEST_GAS_SUHU;
  } else if (masihWarmup()) {
    statusSistem = STATUS_WARMUP;
  } else if (!dhtValid) {
    statusSistem = STATUS_SENSOR_ERROR;
  } else {
    bool gasBahaya = (mq2ADC >= batasGasADC);
    bool suhuBahaya = (suhuC >= BATAS_SUHU_C);

    if (gasBahaya && suhuBahaya) {
      statusSistem = STATUS_BAHAYA_GAS_SUHU;
    } else if (gasBahaya) {
      statusSistem = STATUS_BAHAYA_GAS;
    } else if (suhuBahaya) {
      statusSistem = STATUS_BAHAYA_SUHU;
    } else {
      statusSistem = STATUS_NORMAL;
    }
  }

  bool kondisiNormal = (statusSistem == STATUS_NORMAL);
  bool pemanasan = (statusSistem == STATUS_WARMUP);
  bool inginTutup = !kondisiNormal;
  alarmAktif = !kondisiNormal && !pemanasan;

  if (inginTutup != servoSedangTutup) {
    servoSedangTutup = inginTutup;
    servoGas.write(servoSedangTutup ? SERVO_TUTUP : SERVO_BUKA);
  }
}

void perbaruiOutput() {
  bool pemanasan = (statusSistem == STATUS_WARMUP);
  bool kondisiNormal = (statusSistem == STATUS_NORMAL);

  bool merahNyala = pemanasan ? ((millis() / 500UL) % 2UL == 0UL)
                              : !kondisiNormal;
  digitalWrite(LED_MERAH_PIN, merahNyala ? HIGH : LOW);
  digitalWrite(LED_HIJAU_PIN, kondisiNormal ? HIGH : LOW);

  bool bunyi = alarmAktif &&
               ((millis() / INTERVAL_BUZZER_MS) % 2UL == 0UL);
  digitalWrite(BUZZER_PIN,
               (bunyi == BUZZER_AKTIF_HIGH) ? HIGH : LOW);
}

const char* teksStatus() {
  switch (statusSistem) {
    case STATUS_WARMUP:         return "WARMUP";
    case STATUS_NORMAL:         return "NORMAL";
    case STATUS_BAHAYA_GAS:     return "BAHAYA GAS";
    case STATUS_BAHAYA_SUHU:    return "SUHU TINGGI";
    case STATUS_BAHAYA_GAS_SUHU:return "GAS + SUHU";
    case STATUS_SENSOR_ERROR:   return "ERROR DHT11";
    case STATUS_TEST_GAS:       return "TEST GAS";
    case STATUS_TEST_SUHU:      return "TEST SUHU";
    case STATUS_TEST_GAS_SUHU:  return "TEST G+S";
  }
  return "UNKNOWN";
}

void perbaruiOLED() {
  if (!oledTersedia) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  display.println("SMART KITCHEN");
  display.print("T: ");
  if (dhtValid) display.print(suhuC, 1);
  else display.print("--");
  display.print("C  H: ");
  if (dhtValid) display.print(kelembapan, 0);
  else display.print("--");
  display.println("%");

  display.print("GAS: ");
  display.print(mq2ADC);
  display.print(" / ");
  display.println(batasGasADC);

  display.print("STATUS: ");
  display.println(teksStatus());

  display.print("SERVO : ");
  display.println(servoSedangTutup ? "TUTUP" : "BUKA");

  display.print("BUZZER: ");
  display.println(alarmAktif ? "ALARM" : "OFF");

  display.print("MODE  : ");
  display.println(simulasi == SIM_MATI ? "SENSOR" : "SIMULASI");

  if (masihWarmup() && simulasi == SIM_MATI) {
    unsigned long sisa = (WARMUP_MQ2_MS - (millis() - mulaiMs) + 999UL) / 1000UL;
    display.print("WARMUP ");
    display.print(sisa);
    display.println(" s");
  } else {
    display.println("Serial: g s t r +/-");
  }
  display.display();
}

void cetakSerial() {
  Serial.println("----------------------------------------");
  Serial.print("Suhu C      : ");
  if (dhtValid) Serial.println(suhuC, 1); else Serial.println("ERROR");
  Serial.print("Kelembapan  : ");
  if (dhtValid) Serial.println(kelembapan, 0); else Serial.println("ERROR");
  Serial.print("GAS_ADC     : "); Serial.println(mq2ADC);
  Serial.print("BATAS_GAS   : "); Serial.println(batasGasADC);
  Serial.print("STATUS      : "); Serial.println(teksStatus());
  Serial.print("SERVO       : "); Serial.println(servoSedangTutup ? "TUTUP" : "BUKA");
  Serial.println("Catatan: nilai MQ2 adalah ADC mentah, BUKAN ppm.");
}

void bacaPerintahSerial() {
  while (Serial.available() > 0) {
    char huruf = (char)Serial.read();
    bool adaPerubahan = true;

    switch (huruf) {
      case 'g': case 'G': simulasi = SIM_GAS; break;
      case 's': case 'S': simulasi = SIM_SUHU; break;
      case 't': case 'T': simulasi = SIM_GAS_SUHU; break;
      case 'r': case 'R': simulasi = SIM_MATI; break;
      case '+': batasGasADC = min(4095, batasGasADC + 100); break;
      case '-': batasGasADC = max(100, batasGasADC - 100); break;
      default: adaPerubahan = false; break;
    }

    if (adaPerubahan) {
      hitungStatus();
      perbaruiOutput();
      perbaruiOLED();
      Serial.print("Perintah diterima: "); Serial.println(huruf);
      Serial.print("Mode: ");
      Serial.println(simulasi == SIM_MATI ? "Sensor asli" : "Simulasi");
      cetakSerial();
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_MERAH_PIN, OUTPUT);
  pinMode(LED_HIJAU_PIN, OUTPUT);
  pinMode(MQ2_PIN, INPUT);

  digitalWrite(BUZZER_PIN, BUZZER_AKTIF_HIGH ? LOW : HIGH);
  digitalWrite(LED_MERAH_PIN, HIGH);
  digitalWrite(LED_HIJAU_PIN, LOW);

  analogReadResolution(12);  
  analogSetPinAttenuation(MQ2_PIN, ADC_11db);

  dht.begin();
  servoGas.setPeriodHertz(50);
  servoGas.attach(SERVO_PIN, 500, 2400);
  servoGas.write(SERVO_TUTUP); 
  servoSedangTutup = true;

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  oledTersedia = display.begin(SSD1306_SWITCHCAPVCC, ALAMAT_OLED);
  if (!oledTersedia) {
    Serial.println("OLED gagal inisialisasi; cek VCC/GND/SDA/SCL dan alamat 0x3C.");
  }

  mulaiMs = millis();
  sensorMs = mulaiMs;
  oledMs = mulaiMs;
  mq2ADC = bacaMQ2();
  hitungStatus();
  perbaruiOutput();
  perbaruiOLED();

  Serial.println("\n==========================================");
  Serial.println(" SMART KITCHEN SAFETY - PROTOTYPE");
  Serial.println("==========================================");
  Serial.println("DHT11 + MQ-2 + OLED + SERVO + BUZZER + LED");
  Serial.println("TIDAK menggunakan internet / WiFi / MQTT.");
  Serial.println("Ketik g / s / t untuk simulasi bahaya.");
  Serial.println("Ketik r untuk kembali membaca sensor asli.");
  Serial.println("Ketik + / - untuk ubah ambang MQ2 (step 100).");
  Serial.println("Sebelum demo, periksa tegangan MQ-2 & servo!");
}

void loop() {
  bacaPerintahSerial();

  if (millis() - sensorMs >= INTERVAL_SENSOR_MS) {
    sensorMs = millis();
    bacaSensor();
    hitungStatus();
    cetakSerial();
  }

  if (statusSistem == STATUS_WARMUP && !masihWarmup()) {
    hitungStatus();
  }

  perbaruiOutput();
  if (millis() - oledMs >= INTERVAL_OLED_MS) {
    oledMs = millis();
    perbaruiOLED();
  }
}
