import { useTranslation } from "react-i18next";
import type { QrContent, WifiEncryption } from "../qr/content";
import {
  CountrySelect,
  PhoneField,
  SelectField,
  TextAreaField,
  TextField,
} from "./fields";

const WIFI_ENCRYPTIONS: WifiEncryption[] = ["WPA", "WEP", "nopass"];

/** The structured form for the active content type. Each field emits a fully
 *  typed {@link QrContent} so the parent stores the updated draft as-is. */
export function ContentFields({
  content,
  onChange,
}: {
  content: QrContent;
  onChange: (content: QrContent) => void;
}) {
  const { t } = useTranslation();

  switch (content.type) {
    case "text":
      return (
        <TextAreaField
          label={t("content.text")}
          value={content.text}
          placeholder={t("content.textPlaceholder")}
          onChange={(text) => onChange({ ...content, text })}
        />
      );

    case "url":
      return (
        <TextField
          label={t("content.url")}
          value={content.url}
          placeholder={t("content.urlPlaceholder")}
          onChange={(url) => onChange({ ...content, url })}
        />
      );

    case "email":
      return (
        <>
          <TextField
            label={t("content.emailTo")}
            value={content.to}
            placeholder={t("content.emailPlaceholder")}
            onChange={(to) => onChange({ ...content, to })}
          />
          <TextField
            label={t("content.emailSubject")}
            value={content.subject}
            onChange={(subject) => onChange({ ...content, subject })}
          />
          <TextAreaField
            label={t("content.emailBody")}
            value={content.body}
            onChange={(body) => onChange({ ...content, body })}
          />
        </>
      );

    case "phone":
      return (
        <PhoneField
          label={t("content.phoneNumber")}
          value={content.phone}
          onChange={(phone) => onChange({ ...content, phone })}
        />
      );

    case "wifi":
      return (
        <>
          <TextField
            label={t("content.wifiSsid")}
            value={content.ssid}
            onChange={(ssid) => onChange({ ...content, ssid })}
          />
          <SelectField
            label={t("content.wifiSecurity")}
            value={content.encryption}
            options={WIFI_ENCRYPTIONS}
            getLabel={(e) => t(`content.wifiEnc.${e}`)}
            onChange={(encryption) => onChange({ ...content, encryption })}
          />
          {content.encryption !== "nopass" && (
            <TextField
              label={t("content.wifiPassword")}
              value={content.password}
              onChange={(password) => onChange({ ...content, password })}
            />
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={content.hidden}
              onChange={(e) =>
                onChange({ ...content, hidden: e.target.checked })
              }
            />
            {t("content.wifiHidden")}
          </label>
        </>
      );

    case "vcard":
      return (
        <>
          <TextField
            label={t("content.vcardFirstName")}
            value={content.firstName}
            onChange={(firstName) => onChange({ ...content, firstName })}
          />
          <TextField
            label={t("content.vcardLastName")}
            value={content.lastName}
            onChange={(lastName) => onChange({ ...content, lastName })}
          />
          <TextField
            label={t("content.vcardOrg")}
            value={content.org}
            onChange={(org) => onChange({ ...content, org })}
          />
          <TextField
            label={t("content.vcardTitle")}
            value={content.title}
            onChange={(title) => onChange({ ...content, title })}
          />
          <PhoneField
            label={t("content.vcardPhone")}
            value={content.phone}
            onChange={(phone) => onChange({ ...content, phone })}
          />
          <TextField
            label={t("content.vcardEmail")}
            value={content.email}
            placeholder={t("content.emailPlaceholder")}
            onChange={(email) => onChange({ ...content, email })}
          />
          <TextField
            label={t("content.vcardWebsite")}
            value={content.url}
            onChange={(url) => onChange({ ...content, url })}
          />
          <TextField
            label={t("content.vcardStreet")}
            value={content.address.street}
            onChange={(street) =>
              onChange({ ...content, address: { ...content.address, street } })
            }
          />
          <TextField
            label={t("content.vcardCity")}
            value={content.address.city}
            onChange={(city) =>
              onChange({ ...content, address: { ...content.address, city } })
            }
          />
          <TextField
            label={t("content.vcardRegion")}
            value={content.address.region}
            onChange={(region) =>
              onChange({ ...content, address: { ...content.address, region } })
            }
          />
          <TextField
            label={t("content.vcardPostalCode")}
            value={content.address.postalCode}
            onChange={(postalCode) =>
              onChange({
                ...content,
                address: { ...content.address, postalCode },
              })
            }
          />
          <CountrySelect
            label={t("content.vcardCountry")}
            value={content.address.countryCode}
            onChange={(countryCode) =>
              onChange({
                ...content,
                address: { ...content.address, countryCode },
              })
            }
          />
          <TextAreaField
            label={t("content.vcardNote")}
            value={content.note}
            onChange={(note) => onChange({ ...content, note })}
          />
        </>
      );
  }
}
