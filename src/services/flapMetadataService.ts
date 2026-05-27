import { UserInputError } from "../domain/errors.js";

type FlapMetadataInput = {
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  website?: string;
  telegram?: string;
  x?: string;
};

type PinataResponse = {
  IpfsHash: string;
};

export class FlapMetadataService {
  constructor(private readonly pinataJwt?: string) {}

  async createMetadata(input: FlapMetadataInput): Promise<string> {
    if (this.pinataJwt === undefined) {
      throw new UserInputError("PINATA_JWT is required to upload Flap metadata");
    }
    const payload = {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      image: input.imageUri,
      ...(input.website === undefined ? {} : { website: input.website }),
      ...(input.telegram === undefined ? {} : { telegram: input.telegram }),
      ...(input.x === undefined ? {} : { x: input.x })
    };
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.pinataJwt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: `${input.symbol}-flap-metadata.json`
        },
        pinataContent: payload
      })
    });
    if (!response.ok) {
      throw new UserInputError("Pinata metadata upload failed", { status: response.status });
    }
    const result = (await response.json()) as PinataResponse;
    return `ipfs://${result.IpfsHash}`;
  }
}
