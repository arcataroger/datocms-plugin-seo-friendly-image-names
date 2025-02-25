import {
  type Field,
  type ItemType,
  RenderManualFieldExtensionConfigScreenCtx,
} from "datocms-plugin-sdk";
import { Canvas, Section, Spinner } from "datocms-react-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mention,
  MentionsInput,
  type OnChangeHandlerFunc,
  type SuggestionDataItem,
} from "react-mentions";
import s from "./styles.module.css";
import "datocms-react-ui/styles.css";
import { cmaClient } from "../utils/cmaClient.ts";
import type { Item } from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";
import slugify from "@sindresorhus/slugify";
import { DebugTree } from "../utils/DebugTree.tsx";
import { intersectionOfArrays } from "../utils/intersectionOfArrays.ts";

const SUPPORTED_FIELD_TYPES: readonly Field["attributes"]["field_type"][] = [
  "string",
  "slug",
  "integer",
  "float",
  "link",
];

type Validators =
  | {
      item_item_type?: {
        item_types: string[];
      };
    }
  | undefined;

interface SuggestionDataItemWithMetadata extends SuggestionDataItem {
  field: Field;
}

type PluginParams = {
  templateString?: string;
};

type RelatedModel = {
  model: ItemType;
  fields: Record<string, Field>;
};

type CurrentModelInfo = Record<
  string,
  Field & { relatedModels?: Record<string, RelatedModel> }
>;

export const ManualFieldConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
}) => {
  const {
    itemType: { id: currentModelId },
    fields: allFieldsById,
    itemTypes: allItemTypesById,
    ui: { locale },
    setParameters,
  } = ctx;

  const { parameters } = ctx as { parameters: PluginParams };

  const [templateString, setTemplateString] = useState<string>(
    parameters.templateString ?? "",
  );
  const [exampleRecord, setExampleRecord] = useState<Item>();
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const isLoading = useMemo<boolean>(() => {
    if (!exampleRecord) {
      return true;
    }
    return false;
  }, [exampleRecord]);

  useEffect(() => {
    (async () => {
      try {
        const response = await cmaClient.items.list({
          filter: {
            type: currentModelId,
          },
          page: {
            limit: 1,
          },
          order_by: "_updated_at_DESC",
        });

        if (response) {
          setExampleRecord(response[0]);
        }
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  const getSupportedFields = useCallback(
    (
      modelId: string,
    ): Extract<
      Field,
      { attributes: { field_type: (typeof SUPPORTED_FIELD_TYPES)[number] } }
    >[] =>
      Object.values(allFieldsById)
        .flatMap((field) =>
          field?.relationships?.item_type?.data?.id === modelId &&
          SUPPORTED_FIELD_TYPES.includes(field?.attributes?.field_type)
            ? [field]
            : [],
        )
        .sort((a, b) =>
          a.attributes.api_key.localeCompare(b.attributes.api_key),
        ),
    [allFieldsById, SUPPORTED_FIELD_TYPES],
  );

  const currentModelFields = useMemo<CurrentModelInfo>(() => {
    const supportedFieldsInCurrentModel = getSupportedFields(currentModelId);

    return Object.fromEntries(
      supportedFieldsInCurrentModel.flatMap((field) => {
        switch (field?.attributes?.field_type) {
          case "link": {
            const validators = field?.attributes.validators as Validators;
            const relatedModelIds = validators?.item_item_type?.item_types;
            if (!relatedModelIds) {
              return [];
            }

            const relatedModels = relatedModelIds.map(
              (id) => allItemTypesById[id]!,
            );

            const relatedModelsByApiKey = Object.fromEntries(
              relatedModels.map((model) => [
                model.attributes.api_key,
                {
                  model,
                  fields: Object.fromEntries(
                    getSupportedFields(model.id).map((field) => [
                      field.attributes.api_key,
                      field,
                    ]),
                  ),
                },
              ]),
            );

            return [
              [
                field.attributes.api_key,
                { ...field, relatedModels: relatedModelsByApiKey },
              ],
            ];
          }

          default:
            return [[field.attributes.api_key, field]];
        }
      }),
    );
  }, [currentModelId, allFieldsById]);

  const mentionableFields = useMemo<SuggestionDataItemWithMetadata[]>(() => {
    return Object.entries(currentModelFields).flatMap(
      ([rootFieldName, field]) => {
        switch (field?.attributes?.field_type) {
          case "link":
            if (field.relatedModels) {
              const allRelatedModelFields = Object.values(
                field.relatedModels,
              ).map((model) => Object.values(model.fields));

              const allRelatedFieldNames = allRelatedModelFields.map((model) =>
                model.map((field) => field.attributes.api_key),
              );

              const fieldNamesInCommon: string[] =
                intersectionOfArrays(allRelatedFieldNames);

              console.log("intersected", fieldNamesInCommon);

              return fieldNamesInCommon.flatMap((fieldName) =>
                Object.entries(field.relatedModels!).flatMap(
                  ([modelName, model]) =>
                    Object.values(model.fields)
                      .filter((field) => field.attributes.api_key === fieldName)
                      .map((field) => ({
                        id: field.id,
                        display: `${rootFieldName}.${modelName}.${field.attributes.api_key}`,
                        field: field,
                      })),
                ),
              );
            }
            break;

          default:
            return [
              { id: field.id, display: field.attributes.api_key, field: field },
            ];
        }
      },
    );
  }, [currentModelFields]);

  useEffect(() => {
    if (templateString) {
      setParameters({
        templateString,
      } as PluginParams);
    }
  }, [templateString]);

  const handleTemplateStringChange: OnChangeHandlerFunc = (
    _event,
    newValue,
    _newPlaintext,
    _mentions,
  ) => {
    setTemplateString(newValue);
  };

  const exampleString = useMemo<string | undefined>(() => {
    if (!templateString?.length) {
      return undefined;
    }

    if (!exampleRecord) {
      return undefined;
    }
    const regex = /\{(.+?)}/g;
    const replacedString: string = templateString.replace(regex, (_, match) => {
      const maybeResult = exampleRecord?.[match] as unknown;

      console.log("locale", locale);
      console.log("maybeResult", maybeResult);

      if (!maybeResult) {
        return "undefined";
      }

      switch (typeof maybeResult) {
        case "string":
          return maybeResult;

        case "object":
          // If it's an object, it might be localized. Try to find the first matching locale because we don't know what the actual fallback is.
          // TODO let the user define fallback locales here
          const closestLocale: string | undefined = Object.keys(
            maybeResult,
          ).find((key) => key.startsWith(locale));

          console.log("closest locale", closestLocale);
          if (!closestLocale) {
            return "undefined-locale";
          }

          const maybeStringFromClosestLocale: unknown | undefined =
            (maybeResult as Record<string, unknown>)[closestLocale] ??
            undefined;

          console.log("maybeString", maybeStringFromClosestLocale);

          if (
            !!maybeStringFromClosestLocale &&
            typeof maybeStringFromClosestLocale === "string"
          ) {
            if (maybeStringFromClosestLocale.length === 0) {
              return "EMPTY";
            }

            return maybeStringFromClosestLocale;
          } else {
            return "UNKNOWN";
          }

        default:
          return JSON.stringify(maybeResult);
      }
    });
    console.log(replacedString);
    return slugify(replacedString);
  }, [templateString, exampleRecord]);

  return (
    <Canvas ctx={ctx} noAutoResizer={false}>
      <Section title={"Template String"}>
        <span>
          Enter a filename template using {"{}"} for fields. Do not add an
          extension (like .jpg or .gif):
        </span>
        <div className={s.container}>
          <MentionsInput
            value={templateString}
            onChange={handleTemplateStringChange}
            className={s.templateField}
            singleLine={true}
            placeholder={"e.g. {shopify_product_handle}-{fieldname}-othertext"}
          >
            <Mention
              className={s.mention}
              trigger="{"
              data={mentionableFields}
              markup={"{__display__}"}
              displayTransform={(_, display) => `{${display}}`}
            />
          </MentionsInput>
          <div className={s.extension}>.jpg</div>
        </div>
        <div className={s.templateHint}>
          <>
            Example output:
            <br />
            {isLoading && (
              <span>
                {" "}
                <Spinner size={18} />
                Loading, please wait...
              </span>
            )}
            {!isLoading && exampleString && (
              <>
                <span className={s.example}>{exampleString}</span>.jpg
              </>
            )}
            {!isLoading && !exampleString && (
              <>None yet. Enter a template first.</>
            )}
          </>
        </div>
      </Section>

      <Section
        title="Debug"
        collapsible={{
          isOpen: isDebugOpen,
          onToggle: () => setIsDebugOpen((prev) => !prev),
        }}
      >
        <DebugTree data={{ exampleRecord }} />
        <DebugTree data={{ mentionableFields }} />
        <DebugTree data={{ currentModelFields }} />
      </Section>
    </Canvas>
  );
};
