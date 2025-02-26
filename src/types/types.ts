import type { Field, ItemType, NewUpload } from "datocms-plugin-sdk";
import type { SuggestionDataItem } from "react-mentions";

export type Validators =
  | {
      item_item_type?: {
        item_types: string[];
      };
    }
  | undefined;

export interface SuggestionDataItemWithMetadata extends SuggestionDataItem {
  field: Field;
}

export type PluginParams = {
  templateString?: string;
};
type RelatedModel = {
  model: ItemType;
  fields: Record<string, Field>;
};
export type CurrentModelInfo = Record<
  string,
  Field & { relatedModels?: Record<string, RelatedModel> }
>; // Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
export type AssetGalleryMetadata = NonNullable<
  NewUpload["default_field_metadata"]
>[string] & { upload_id: string };
export type ImageNeedingUpdate = {
  id: string;
  currentBasename: string;
  slugifiedBasename: string;
  ext: string;
  thumbnailSrc: string;
};
