import { Button, Canvas, Section, Spinner } from "datocms-react-ui";
import type { NewUpload, RenderFieldExtensionCtx } from "datocms-plugin-sdk";
import type {
  Item,
  Upload,
} from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";
import { useEffect, useMemo, useState } from "react";
import { buildClient, LogLevel } from "@datocms/cma-client-browser"; // Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues

// Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
type AssetGalleryMetadata = NonNullable<
  NewUpload["default_field_metadata"]
>[string] & { upload_id: string };
type CollectionRecord = Item & { product_type?: string };
type ImageNeedingUpdate = {
  id: string;
  currentBasename: string;
  slugifiedBasename: string;
  ext: string;
  thumbnailSrc: string;
};

const slugifyProductType = (productType: string): string => {
  // TODO replace this with a locale-aware slugify lib, but only if they want localized basenames

  const slugified: string = productType
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, "-");

  const pluralized = `${slugified}s`;

  return pluralized;
};

const slugifyImageName = ({
  productType,
  productHandle,
  imgMimeType,
  numberSuffix,
}: {
  productType: string;
  productHandle: string;
  imgMimeType?: string;
  numberSuffix: string | number;
}): string => {
  const mediaType: string = imgMimeType?.startsWith("video")
    ? "video"
    : "image";
  return `${slugifyProductType(productType)}-${productHandle}-${mediaType}-${numberSuffix}`;
};

export const SEOFriendlyImageNames = ({
  ctx,
}: {
  ctx: RenderFieldExtensionCtx;
}) => {
  /** Basic setup **/
  // These are provided to us by the plugin SDK. They are passed from main.tsx.
  const { formValues, fieldPath } = ctx;

  // The asset gallery images (or technically, just their metadata)
  const galleryItems = formValues[fieldPath] as AssetGalleryMetadata[];

  // Shopify product handle
  const productHandle = formValues["shopify_product_handle"] as string;

  // Shopify collection, which we'll need to look up the product category
  const collectionId = formValues["collection"] as string;

  const [images, setImages] = useState<Upload[]>([]);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>();
  const [isSectionOpen, setIsSectionOpen] = useState<boolean>(false);

  const productType = useMemo(() => {
    if (!collection) return "";

    if (collection["product_type"]) {
      return collection["product_type"];
    } else {
      console.warn(`Product type not found in collection ${collectionId}`);
      return "";
    }
  }, [collection]);

  // Limited-permission API token from https://vrai.admin.datocms.com/environments/datocms-support-plugin-testing/project_settings/access_tokens/321640/edit
  // You could also use ctx.currentUserAccessToken instead, but that has all the permissions of the current editor. This way is safer.
  const accessToken = import.meta.env.VITE_DATOCMS_LIMITED_ACCESS_TOKEN;

  // Initialize Dato CMA client
  const client = buildClient({
    apiToken: accessToken,
    environment: "datocms-support-plugin-testing", // Replace with primary once tested
    logLevel: LogLevel.BASIC, // Or LogLevel.BODY for more debug info
  });

  /** Fetch needed data from the CMA and update our local state **/

  const fetchImageData = async () => {
    try {
      const ids = galleryItems.map((img) => img.upload_id);
      setIsLoading(true);
      setLoadingMessage("Fetching image metadata...");
      const images = await client.uploads.list({
        filter: {
          ids: ids.join(),
        },
      });

      // But they come back out-of-order, so we have to manually sort them
      if (images) {
        let reorderedImages: Upload[] = [];
        images.forEach((img) => {
          const originalIndex = ids.indexOf(img.id);
          reorderedImages[originalIndex] = img;
        });
        setImages(reorderedImages);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        // Get the product type from the collection Id
        setLoadingMessage("Fetching product category...");
        const collection = await client.items.find(collectionId);
        if (collection) {
          setCollection(collection);
        }

        // Get existing image information
        if (galleryItems.length >= 1) {
          await fetchImageData();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    })();
  }, [collectionId, galleryItems]);

  /** Identify images needing a basename update (basename is just the filename without extension, because that's what the CMA wants) **/

  // Calculate the correct slugified names
  const updatedImageNames = useMemo<string[]>(
    () =>
      images.map((img) =>
        slugifyImageName({
          productType,
          productHandle,
          imgMimeType: img.mime_type ?? undefined,
          // numberSuffix: index + 1 // This makes it pretty confusing when they are reordered in the gallery
          numberSuffix: img.md5.slice(0, 5), // We can use a shortened hash instead to better keep track of them
        }),
      ),
    [images],
  );

  // Calculate which images still need the updated names
  const imagesNeedingUpdate = useMemo<ImageNeedingUpdate[]>(
    () =>
      images.flatMap((img, index) => {
        if (img.basename !== updatedImageNames[index]) {
          return [
            {
              id: img.id,
              currentBasename: img.basename,
              slugifiedBasename: updatedImageNames[index],
              ext:
                img.format ??
                img.filename.match(/\.([0-9a-z]+)(?:[?#]|$)/i)?.[1] ??
                "",
              thumbnailSrc: img.mime_type?.startsWith("image")
                ? `${img.url}?auto=compress&w=50&h=50&fit=crop`
                : videoIcon,
            },
          ];
        } else {
          return [];
        }
      }),
    [images, updatedImageNames],
  );

  const updateSingleFile = async ({
    id,
    newBasename,
  }: {
    id: string;
    newBasename: string;
  }) => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Renaming image ${id} to ${newBasename}...`);
      const updatedImage = await client.uploads.update(id, {
        basename: newBasename,
      });

      // Double-check to make sure the image updated successfully
      if (updatedImage.basename === newBasename) {
        // Refresh our local image state to sync it with the gallery
        setImages((prevImages) =>
          prevImages.map((prevImg) =>
            prevImg.id === updatedImage.id ? updatedImage : prevImg,
          ),
        );
      } else {
        throw new Error(
          `Image ${id} basename mismatch even after update: ${updatedImage.basename} does not match ${newBasename}`,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };

  const handleSingleFileUpdate = async (id: string) => {
    const { slugifiedBasename, currentBasename } = imagesNeedingUpdate.find(
      (img) => img.id === id,
    )!;

    const result = await ctx.openConfirm({
      title: `Rename ${currentBasename}?`,
      content: `New name: ${slugifiedBasename}?`,
      choices: [
        {
          label: "Rename this file",
          value: true,
          intent: "positive",
        },
      ],
      cancel: {
        label: "Go back",
        value: false,
      },
    });

    if (result) {
      try {
        await updateSingleFile({
          id: id,
          newBasename: slugifiedBasename,
        });
        await ctx.notice(`Updated to ${slugifiedBasename}`);
      } catch (error) {
        console.log(error);
        await ctx.alert(`Failed to update ${currentBasename}: ${error}`);
      }
    }
  };

  const updateAllFilesInParallel = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Updating ${imagesNeedingUpdate.length} names...`);
      // Update all the names. DatoCMS limit is 60 every 3 seconds, so we don't need to worry about it.
      await Promise.all(
        imagesNeedingUpdate.map(async (img) => {
          await client.uploads.update(img.id, {
            basename: img.slugifiedBasename,
          });
        }),
      );

      // Refresh our local images state, just to make sure the updates all went through
      await fetchImageData();
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMessage(null);
      setIsLoading(false);
    }
  };

  const handleUpdateAllFiles = async () => {
    const result = await ctx.openConfirm({
      title: `Rename ${imagesNeedingUpdate.length} files?`,
      content: `The update will happen in the background and might take 5-10 seconds.`,
      choices: [
        {
          label: `Rename all ${imagesNeedingUpdate.length} files`,
          value: true,
          intent: "positive",
        },
      ],
      cancel: {
        label: "Go back",
        value: false,
      },
    });

    if (result) {
      try {
        await updateAllFilesInParallel();
        await ctx.notice(
          `Successfully updated ${imagesNeedingUpdate.length} files`,
        );
      } catch (error) {
        console.log(error);
        await ctx.alert(`Bulk update failed: ${error}`);
      }
    }
  };

  return (
    <Canvas ctx={ctx}>
      <Section
        title={`${imagesNeedingUpdate.length ? "⚠️" : "✅"} Asset Stack SEO Plugin: ${imagesNeedingUpdate.length >= 1 ? `${imagesNeedingUpdate.length} update(s) needed` : "All good!"}`}
        collapsible={{
          isOpen: isSectionOpen,
          onToggle: () => setIsSectionOpen((prev) => !prev),
        }}
      >
        <div style={{ border: '1px solid var(--primary-color)', padding: 30, paddingTop: 0, backgroundColor: "var(--light-color)" }}>
          {isLoading && (
            <div>
              <Spinner size={24} />{" "}
              <span>Loading: {loadingMessage ?? "Please wait..."}</span>
            </div>
          )}

          {!isLoading && imagesNeedingUpdate.length >= 1 && (
            <>
              <h2>
                {imagesNeedingUpdate.length} image(s) need a SEO-friendly
                filename (out of {galleryItems.length} total):
              </h2>
              {imagesNeedingUpdate.map((img) => (
                <div
                  key={img.id}
                  style={{ display: "flex", marginBottom: "2em" }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <a
                      href={"#"}
                      onClick={async () => {
                        const editResult = await ctx.editUpload(img.id);
                        if (editResult) {
                          await fetchImageData(); // So the plugin sees the updates
                        }
                      }}
                    >
                      <img
                        src={img.thumbnailSrc}
                        alt={img.currentBasename}
                        style={{
                          border: "2px solid lightgray",
                          width: 50,
                          height: 50,
                        }}
                        title={img.currentBasename}
                      />
                    </a>
                  </div>
                  <div style={{ display: "flex" }}>
                    <ul style={{ padding: 10, listStyle: "none" }}>
                      <li>
                        Currently:{" "}
                        <strong>
                          {img.currentBasename}.{img.ext}
                        </strong>
                      </li>

                      <li>
                        Should be "{img.slugifiedBasename}.{img.ext}".{" "}
                        <a
                          href={"#"}
                          onClick={() => handleSingleFileUpdate(img.id)}
                        >
                          Update
                        </a>
                        ?
                      </li>
                    </ul>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                buttonSize="l"
                onClick={() => handleUpdateAllFiles()}
                buttonType="primary"
              >
                Update All ({imagesNeedingUpdate.length})
              </Button>
            </>
          )}

          {!isLoading && !imagesNeedingUpdate.length && (
            <div style={{ fontSize: 18 }}>
              <p>
                Everything looks good! You don't need any filename updates right
                now.{" "}
                <a
                  href={"#"}
                  onClick={() => {
                    fetchImageData();
                  }}
                >
                  Check again?
                </a>
              </p>
            </div>
          )}

          <div
            style={{ background: "white", padding: "10px 1em", marginTop: 20 }}
          >
            <p>
              <strong>SEO Plugin Debug Info</strong>
            </p>

            <p>
              <a
                href={"#"}
                onClick={() => {
                  fetchImageData();
                }}
              >
                Refresh list
              </a>
            </p>
            <ul>
              <li>
                {images.length} images cached (out of {galleryItems.length} in
                gallery)
              </li>
              <li>Collection ID: {collectionId}</li>
              <li>Shopify handle: {productHandle}</li>
              <li>Product type: {productType}</li>
            </ul>
          </div>
        </div>
      </Section>
    </Canvas>
  );
};

const videoIcon =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBMaWNlbnNlOiBQRC4gTWFkZSBieSBzdGVwaGVuaHV0Y2hpbmdzOiBodHRwczovL2dpdGh1Yi5jb20vc3RlcGhlbmh1dGNoaW5ncy9taWNyb25zIC0tPgo8c3ZnIGZpbGw9IiMwMDAwMDAiIHdpZHRoPSI1MHB4IiBoZWlnaHQ9IjUwcHgiIHZpZXdCb3g9IjAgLTggNTI4IDUyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiA+PHRpdGxlPnZpZGVvPC90aXRsZT48cGF0aCBkPSJNMjY0IDQ1NlEyMTEgNDU2IDE2NCA0MjkgMTE4IDQwMiA5MSAzNTYgNjQgMzEwIDY0IDI1NiA2NCAyMDIgOTEgMTU2IDExOCAxMTAgMTY0IDgzIDIxMCA1NiAyNjQgNTYgMzE4IDU2IDM2NCA4MyA0MTAgMTEwIDQzNyAxNTYgNDY0IDIwMiA0NjQgMjU2IDQ2NCAzMDkgNDM3IDM1NiA0MTAgNDAyIDM2NCA0MjkgMzE4IDQ1NiAyNjQgNDU2Wk0zNDUgMjU2TDIxNiAxNjAgMjE2IDM1MiAzNDUgMjU2WiIgLz48L3N2Zz4=";
