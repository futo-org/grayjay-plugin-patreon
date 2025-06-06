const PLATFORM = "Patreon";
const PLATFORM_CLAIMTYPE = 12;

const BASE_URL = "https://www.patreon.com";
const BASE_URL_API = "https://www.patreon.com/api";
const URL_HOME = BASE_URL + "/home";
const URL_POSTS = BASE_URL_API + "/posts";
const URL_SEARCH_CREATORS = BASE_URL_API + "/search";
const URL_USER = BASE_URL_API + "/current_user";
const URL_LAUNCHER_CARDS = BASE_URL_API + "/launcher/cards";

const REGEX_CHANNEL_DETAILS = /Object\.assign\(window\.patreon\.bootstrap, ({.*?})\);/s
const REGEX_CHANNEL_DETAILS2 = /window\.patreon = ({.*?});/s
const REGEX_CHANNEL_DETAILS3 = /id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
const REGEX_CHANNEL_URL = /https:\/\/(?:www\.)?patreon.com\/(.+)/s

const REGEX_MEMBERSHIPS = /<ul aria-label="Memberships".*?>(.*?)<\/ul>/s
const REGEX_MEMBERSHIPS_URLS = /<a href="(.*?)"/g
const REGEX_URL_ID = /https:\/\/(?:www\.)?patreon.com\/posts\/.*-(.*)\/?/s

// Common request modifier for all Patreon requests
const PATREON_REQUEST_MODIFIER = {
	headers: {
		"Referer": "https://www.patreon.com/",
		"Origin": "https://www.patreon.com"
	}
};

var config = {};
var _settings = {};

let _channelCache = {};


//Source Methods
source.enable = function (conf, settings, savedState) {
	config = conf ?? {};
	_settings = settings ?? {};

}
source.getHome = function () {

	if (!bridge.isLoggedIn()) {
		return new ContentPager([], false);
	}
	
	return new HomePager();
};

source.searchSuggestions = function (query) {
	return [];
};
source.getSearchCapabilities = () => {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};
source.search = function (query, type, order, filters) {
	return new ContentPager([].false);
};
source.getSearchChannelContentsCapabilities = function () {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};
source.searchChannelContents = function (channelUrl, query, type, order, filters) {
	throw new ScriptException("This is a sample");
};

source.searchChannels = function (query) {
	return new SearchChannelPager(query);
};
class SearchChannelPager extends ChannelPager {
	constructor(query) {
		super(searchChannels(query, 1))
		this.query = query;
		this.page = 1;
	}
	nextPage() {
		this.page = this.page + 1;
		this.results = searchChannels(query, this.page + 1);
		this.hasMore = this.results.length > 0;
		return this;
	}
}

//Home Pager
class HomePager extends ContentPager {
	constructor() {
		const initialData = getHomeContent();
		super(initialData.results, initialData.hasMore);
		this.nextPageUrl = initialData.nextPageUrl;
	}
	
	nextPage() {
		if (!this.nextPageUrl) {
			this.hasMore = false;
			return this;
		}
		
		const newData = getHomeContent(this.nextPageUrl);
		this.results = newData.results;
		this.hasMore = newData.hasMore;
		this.nextPageUrl = newData.nextPageUrl;
		return this;
	}
}

//Channel
source.isChannelUrl = function (url) {
	return REGEX_CHANNEL_URL.test(url);
};
source.getChannel = function (url) {
	const channelResp = http.GET(url, {}, false);
	if (!channelResp.isOk)
		throw new ScriptException("Failed to get channel");

	let channelJson = REGEX_CHANNEL_DETAILS.exec(channelResp.body);

	let channel = null;
	if (!channelJson || channelJson.length != 2) {
		channelJson = REGEX_CHANNEL_DETAILS2.exec(channelResp.body);
		if (channelJson && channelJson.length == 2) {
			channel = JSON.parse(channelJson[1]);

			if (channel && channel.bootstrap)
				channel = channel.bootstrap;
			else
				throw new ScriptException("Failed to parse channel");
		}
		else {
			channelJson = REGEX_CHANNEL_DETAILS3.exec(channelResp.body);
			if (channelJson && channelJson.length == 2) {
				const channelWrapperObj = JSON.parse(channelJson[1]);
				channel = channelWrapperObj?.props?.pageProps?.bootstrapEnvelope?.bootstrap
					?? channelWrapperObj?.props?.pageProps?.bootstrapEnvelope?.pageBootstrap;

				if (!channel)
					throw new ScriptException("Failed to parse channel");
			}
			else
				throw new ScriptException("Failed to extract channel");
		}
	}
	else
		channel = JSON.parse(channelJson[1]);

	const result = new PlatformChannel({
		id: new PlatformID(config.name, channel?.campaign?.data?.id, config.id, PLATFORM_CLAIMTYPE),
		name: channel?.campaign?.data?.attributes?.name,
		description: channel?.campaign?.data?.attributes?.description ?? channel?.campaign?.data?.attributes?.summary,
		url: channel?.campaign?.data?.attributes?.url,
		subscribers: channel?.campaign?.data?.attributes?.patron_count,
		banner: channel?.campaign?.data?.attributes?.image_url ?? channel?.campaign?.data?.attributes?.cover_photo_url ?? channel?.campaign?.data?.attributes?.cwh_cover_image_urls?.large,
		thumbnail: channel?.campaign?.data?.attributes?.avatar_photo_url ?? channel?.campaign?.data?.attributes?.avatar_photo_image_urls?.thumbnail
	});

	_channelCache[url] = result;
	return result;
};
source.getChannelContents = function (url) {
	const channel = (_channelCache[url]) ? _channelCache[url] : source.getChannel(url);
	_channelCache[url] = channel;
	return new ChannelContentPager(channel.id.value, channel);
};
class ChannelContentPager extends ContentPager {
	constructor(campaignId, channel) {
		const initialResults = getPosts(campaignId, channel);
		super(initialResults.results, true);
		this.nextPageUrl = initialResults.nextPage;
		this.hasMore = !!this.nextPageUrl;
		this.campaignId = campaignId;
		this.channel = channel;
	}
	nextPage() {
		if (!this.nextPage)
			throw new ScriptException("No next page");
		const newResults = getPosts(this.campaignId, this.channel, this.nextPageUrl) ?? [];
		this.results = newResults.results;
		this.nextPageUrl = newResults.nextPage;
		this.hasMore = !!newResults.nextPage;
		return this;
	}
}

source.getChannelTemplateByClaimMap = () => {
	return {
		//Patreon
		12: {
			0: URL_BASE + "/{{CLAIMVALUE}}"
		}
	};
};

//Video
source.isContentDetailsUrl = function (url) {
	return REGEX_URL_ID.test(url);
};
source.getContentDetails = function (url) {
	throw new ScriptException("This is a sample");
};

//Comments
source.getComments = function (url, page = 0) {
	const idMatch = REGEX_URL_ID.exec(url) ?? [];
	if (idMatch.length != 2)
		return new CommentPager([], false);
	const id = idMatch[1];
	const commentsResp = http.GET("https://www.patreon.com/api/posts/" + id + "/comments" +
		"?include=include_replies%2Ccommenter%2Creplies%2Creplies.commenter" +
		"&fields[comment]=body%2Ccreated%2Cvote_sum%2Creply_count" +
		"&fields[post]=comment_count" +
		"&fields[user]=image_url%2Cfull_name%2Curl" +
		"&fields[flair]=image_tiny_url%2Cname" +
		"&page[count]=10" +
		"&sort=-created" +
		"&json-api-use-default-includes=false" +
		"&json-api-version=1.0", {}, true);
	if (!commentsResp.isOk)
		throw new ScriptException("Failed to get comments [" + commentsResp.code + "]");

	return new PatreonCommentPager(url, JSON.parse(commentsResp.body));
}
source.getSubComments = function (comment) {
	return new CommentPager([], false);
}

class PatreonCommentPager extends CommentPager {

	constructor(url, resp) {
		if (IS_TESTING)
			log("CommentPager resp:", resp);

		const nextUrl = resp?.links?.next;
		super([], !!nextUrl);
		this.contextUrl = url;
		this.results = this.parseResponse(resp);
		this.nextPageUrl = nextUrl;
		this.hasMore = !!nextUrl;
	}

	nextPage() {
		const resp = http.GET(this.nextPageUrl, {}, true);
		if (!resp.isOk)
			throw new ScriptException("Failed to get next comment page [" + resp.code + "]")

		const responseBody = JSON.parse(resp.body);
		this.results = this.parseResponse(responseBody);
		this.nextPageUrl = responseBody?.links?.next;
		
		this.hasMore = !!this.nextPageUrl;
		
		return this;
	}

	parseResponse(resp) {
		return resp.data.map(x => this.parseComment(x, resp)).filter(x => x != null)
	}
	parseComment(comment, resp) {
		const commenterId = comment?.relationships?.commenter?.data?.id;
		if (!commenterId)
			return null;
		const commenter = resp.included?.find(y => y.id == commenterId);
		if (!commenter)
			return null;

		return new PatreonComment({
			contextUrl: this.contextUrl,
			author: new PlatformAuthorLink(new PlatformID(config.name, comment.id, PLATFORM_CLAIMTYPE), commenter.attributes.full_name, commenter.attributes.url, commenter.attributes.image_url),
			message: comment.attributes.body,
			rating: new RatingLikes(comment.attributes.vote_sum),
			date: parseInt(Date.parse(comment.attributes.created) / 1000),
			replyCount: comment.attributes.reply_count ?? 0,
			subComments: comment.relationships.replies?.data
				?.map(y => resp.included?.find(z => z.id == y.id))
				?.map(y => this.parseComment(y, resp))
				?.filter(z => z != null) ?? []
		});
	}
}

class PatreonComment extends Comment {
	constructor(obj) {
		super(obj);

		if (obj.subComments)
			this.subComments = obj.subComments;
		else
			this.subComments = [];
	}

	getReplies() {
		return new CommentPager(this.subComments, false);
	}
}

source.getUserSubscriptions = function () {
	const homePageResp = http.GET(URL_USER + "?include=active_memberships.campaign", {}, true);
	if (!homePageResp.isOk)
		throw new ScriptException("Failed to get subscriptions");

	const response = JSON.parse(homePageResp.body)

	return response.data.relationships.active_memberships.data.map((membership) => {
		const channel_id = response.included.find((extra) => extra.id === membership.id).relationships.campaign.data.id
		const channel_url = response.included.find((extra) => extra.id === channel_id).attributes.url
		return channel_url
	})
}

function getPosts(campaign, context, nextPage) {
	const dataResp = http.GET((!nextPage) ? BASE_URL_API + "/posts" +
		"?filter[campaign_id]=" + campaign +
		"&include=images" +
		"&filter[contains_exclusive_posts]=true" +
		"&sort=-published_at" : nextPage, {}, true);

	if (!dataResp.isOk)
		throw new ScriptException("Failed to get posts");
	const data = JSON.parse(dataResp.body);

	if (IS_TESTING)
		console.log("getPosts data:", data);

	// Map all posts to Platform content using the reusable mapping functions
	const contents = data.data
		.map(post => mapPostToPlatformContent(post, context, data))
		.filter(content => content != null);

	return {
		results: contents,
		nextPage: data?.links?.next
	};
}


function searchChannels(query, page) {
	const dataResp = http.GET(URL_SEARCH_CREATORS +
		"?q=" + query +
		"&page[number]=" + page +
		"&json-api-version=1.0&includes=[]", {}, false);

	if (!dataResp.isOk)
		throw new ScriptException("Failed to search creators");
	const data = JSON.parse(dataResp.body);

	const channels = [];
	for (let item of data.data) {
		const id = item.id;
		if (id.startsWith("campaign_"))
			channels.push(new PlatformAuthorLink(new PlatformID(config.name, id.substring("campaign_".length), config.id, PLATFORM_CLAIMTYPE),
				item.attributes.name,
				item.attributes.url,
				item.attributes.avatar_photo_url,
				item.attributes.patron_count));
	}

	return channels.filter(x => x != null);
}

// Function to get home content from launcher/cards API
function getHomeContent(url) {
	const requestUrl = url || (URL_LAUNCHER_CARDS + 
		"?include=campaign.creator.null,campaign.null,campaign.rewards.null,campaign.current_user_pledge.null," +
		"latest_posts,latest_posts.audio.null,latest_posts.recent_comments.parent,latest_posts.recent_comments.on_behalf_of_campaign.null," +
		"latest_posts.recent_comments.commenter.campaign.null,latest_posts.recent_comments.commenter_identity," +
		"latest_posts.recent_comments.commenter_identity.primary_avatar,latest_posts.recent_comments.first_reply.commenter_identity," +
		"latest_posts.recent_comments.first_reply.commenter_identity.primary_avatar,latest_posts.recent_comments.first_reply.commenter.campaign.null," +
		"latest_posts.recent_comments.first_reply.parent,latest_posts.recent_comments.first_reply.post," +
		"latest_posts.recent_comments.first_reply.on_behalf_of_campaign.null,latest_posts.images.null,latest_posts.poll.null," +
		"latest_posts.poll.choices,latest_posts.poll.current_user_responses.user.null,latest_posts.poll.current_user_responses.choice," +
		"latest_posts.access_rules,latest_posts.access_rules.tier,latest_posts.drop,latest_posts.livestream,latest_posts.shows," +
		"latest_posts.content_unlock_options,latest_posts.content_unlock_options.product_variant.null," +
		"latest_posts.content_unlock_options.product_variant.collection.null,latest_posts.content_unlock_options.reward.null," +
		"latest_highlights,latest_product_variant,latest_product_variant.content_media,latest_product_variant.preview_media," +
		"upcoming_drops.null,upcoming_drops.post.null,upcoming_drops.post.drop.null,upcoming_drops.post.livestream,upcoming_drops.post.audio.null%5E" +
		"&fields%5Bcampaign%5D=id,avatar_photo_image_urls,name,url,vanity,cover_photo_url_sizes,creation_count,currency," +
		"current_user_is_free_member,main_video_embed,main_video_url,offers_paid_membership,one_liner,pay_per_name,post_count," +
		"pledge_url,primary_theme_color,summary,is_monthly%5E" +
		"&fields%5Bcomment%5D=body,created,deleted_at,is_by_patron,is_by_creator,is_liked_by_creator,vote_sum,current_user_vote,reply_count,visibility_state" +
		"&fields%5Bcontent-unlock-option%5D=content_unlock_type,reward_benefit_categories" +
		"&fields%5Bdisplay-identity%5D=name,link_url" +
		"&fields%5Bpost%5D=id,attachments_media,change_visibility_at,comment_count,content,content_teaser_text,current_user_can_comment," +
		"current_user_can_report,current_user_can_view,current_user_has_liked,created_at,current_user_comment_disallowed_reason," +
		"embed,is_new_to_current_user,image,images,is_paid,like_count,likes,patreon_url,pledge_url,post_file,post_type," +
		"post_metadata,preview_asset_type,published_at,teaser_text,thumbnail,title,upgrade_url,url,was_posted_by_campaign_owner,video_preview" +
		"&fields%5Bproduct-variant%5D=name,id,price_cents,published_at_datetime,url,access_metadata,content_type,checkout_url" +
		"&fields%5Bdrop%5D=created_at,expires_at,scheduled_for,cover_image,cover_image.url,is_droppable,comments_cid,presence_cid,presence_count" +
		"&fields%5Bmedia%5D=id,image_urls,display,download_url,metadata,file_name,state" +
		"&fields%5Blivestream%5D=state,display" +
		"&filter%5Bshow_shop_posts%5D=false" +
		"&json-api-version=1.0" +
		"&json-api-use-default-includes=false" +
		"&page%5Bcount%5D=10");
	
	const response = http.GET(requestUrl, {}, true);
	
	if (!response.isOk) {
		console.log("Failed to get home content: " + response.code);
		return { results: [], hasMore: false, nextPageUrl: null };
	}
	
	const data = JSON.parse(response.body);
	const contents = [];
	
	// Build lookup maps for efficient access
	const includedMap = createIncludedLookupMap(data.included);
	
	// Extract campaigns and their posts
	if (data.data) {
		for (const card of data.data) {
			if (card.type === "launcher-card" && card.attributes?.card_type === "campaign") {
				// Get campaign from included data
				const campaignId = card.relationships?.campaign?.data?.id;
				const campaign = includedMap.get(`campaign:${campaignId}`);
				
				if (campaign) {
					// Create campaign context for posts
					const campaignContext = {
						name: campaign.attributes?.name,
						url: campaign.attributes?.url,
						thumbnail: campaign.attributes?.avatar_photo_image_urls?.thumbnail,
						subscribers: campaign.attributes?.patron_count || 0
					};
					
					// Get latest posts for this campaign
					const postIds = card.relationships?.latest_posts?.data || [];
					for (const postRef of postIds) {
						const post = includedMap.get(`post:${postRef.id}`);
						if (post && post.attributes?.current_user_can_view) {
							// Process post based on type
							const content = processPost(post, includedMap, campaignContext);
							if (content) {
								contents.push(content);
							}
						}
					}
				}
			}
		}
	}
	
	return {
		results: contents,
		hasMore: !!data.links?.next,
		nextPageUrl: data.links?.next || null
	};
}

// Unified post processing function
function processPost(post, includedMap, context) {
	return mapPostToPlatformContent(post, context, includedMap);
}

// Helper to create author from post and context
function createAuthor(post, context) {
	return new PlatformAuthorLink(
		new PlatformID(config.name, post.relationships?.campaign?.data?.id, config.id, PLATFORM_CLAIMTYPE),
		context.name,
		context.url,
		context.thumbnail,
		context.subscribers || 0
	);
}

// ===== REUSABLE MAPPING FUNCTIONS =====

// Maps a Patreon post to the appropriate Platform content class
function mapPostToPlatformContent(post, context, includedLookup) {
	const attrs = post?.attributes;
	if (!attrs) return null;
	
	// Handle locked content
	if (!attrs.current_user_can_view) {
		return mapToLockedContent(post, context);
	}
	
	// Handle embedded content first
	if (attrs.embed?.url) {
		return mapToNestedMediaContent(post, context);
	}
	
	// Handle different post types
	switch (attrs.post_type) {
		case "video_external_file":
		case "podcast":
			return mapToVideoContent(post, context);
			
		case "audio_file":
			return mapToAudioContent(post, context);
			
		case "text_only":
			return mapToTextContent(post, context);
			
		case "image_file":
			return mapToImageContent(post, context, includedLookup);
			
		default:
			return null;
	}
}

// Maps post to PlatformVideoDetails for video content
function mapToVideoContent(post, context) {
	const attrs = post?.attributes;
	if (!attrs?.post_file?.url) return null;
	
	return new PlatformVideoDetails({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title,
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		duration: attrs.post_file.duration || 0,
		description: attrs.content || attrs.teaser_text || "",
		rating: new RatingLikes(attrs.like_count || 0),
		thumbnails: new Thumbnails([
			new Thumbnail(attrs.thumbnail?.url || attrs.image?.thumb_url, 1)
		].filter(t => t.url)),
		video: createVideoDescriptor(attrs.post_file)
	});
}

// Maps post to PlatformVideoDetails for audio content
function mapToAudioContent(post, context) {
	const attrs = post?.attributes;
	if (!attrs?.post_file?.url) return null;
	
	return new PlatformVideoDetails({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title,
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		duration: attrs.post_file.duration || 0,
		description: attrs.content || attrs.teaser_text || "",
		rating: new RatingLikes(attrs.like_count || 0),
		thumbnails: new Thumbnails([
			new Thumbnail(attrs.thumbnail?.url, 1)
		].filter(t => t.url)),
		video: new UnMuxVideoSourceDescriptor([], [
			new AudioUrlSource({
				name: "Audio",
				url: attrs.post_file.url,
				duration: attrs.post_file.duration,
				requestModifier: PATREON_REQUEST_MODIFIER
			})
		])
	});
}

// Maps post to PlatformPostDetails for text content
function mapToTextContent(post, context) {
	const attrs = post?.attributes;
	if (!attrs?.title && !attrs?.content) return null;
	
	const maxDescriptionLength = 500;
	let description = attrs.teaser_text || "";
	
	if (attrs.content) {
		const text = domParser.parseFromString(attrs.content).text;
		description = text.length > maxDescriptionLength 
			? text.substring(0, maxDescriptionLength) + "..."
			: text;
	}
	
	return new PlatformPostDetails({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title || "Text Post",
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		rating: new RatingLikes(attrs.like_count || 0),
		description: description,
		textType: Type.Text.HTML,
		content: attrs.content || attrs.teaser_text || "",
		images: [],
		thumbnails: []
	});
}

// Maps post to PlatformPostDetails for image content
function mapToImageContent(post, context, includedLookup) {
	const attrs = post?.attributes;
	if (!attrs?.post_metadata?.image_order) return null;
	
	// Use provided lookup or search in included data
	const images = attrs.post_metadata.image_order
		.map(id => {
			if (includedLookup instanceof Map) {
				return includedLookup.get(`media:${id}`);
			} else if (includedLookup?.included) {
				return includedLookup.included.find(item => item.id === id);
			}
			return null;
		})
		.filter(item => item && item.attributes?.image_urls);
	
	if (images.length === 0) return null;
	
	const maxDescriptionLength = 500;
	let description = attrs.teaser_text || "";
	
	if (attrs.content) {
		const text = domParser.parseFromString(attrs.content).text;
		description = text.length > maxDescriptionLength 
			? text.substring(0, maxDescriptionLength) + "..."
			: text;
	}
	
	return new PlatformPostDetails({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title || "Image Post",
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		rating: new RatingLikes(attrs.like_count || 0),
		description: description,
		textType: Type.Text.HTML,
		content: attrs.content || "",
		images: images.map(img => img.attributes.image_urls.original),
		thumbnails: images.map(img => img.attributes.image_urls.thumbnail 
			? new Thumbnails([new Thumbnail(img.attributes.image_urls.thumbnail, 1)]) 
			: null)
	});
}

// Maps post to PlatformNestedMediaContent for embedded content
function mapToNestedMediaContent(post, context) {
	const attrs = post?.attributes;
	if (!attrs?.embed?.url) return null;
	
	return new PlatformNestedMediaContent({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title,
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		contentUrl: attrs.embed.url,
		contentName: attrs.embed.subject,
		contentDescription: attrs.embed.description,
		contentProvider: attrs.embed.provider,
		contentThumbnails: new Thumbnails([
			new Thumbnail(attrs.thumbnail?.large, 1)
		].filter(x => x.url))
	});
}

// Maps post to PlatformLockedContent for locked content
function mapToLockedContent(post, context) {
	const attrs = post?.attributes;
	if (_settings?.hideUnpaidContent) return null;
	
	return new PlatformLockedContent({
		id: new PlatformID(config.name, post.id, config.id),
		name: attrs.title,
		author: createAuthor(post, context),
		datetime: attrs.published_at ? (Date.parse(attrs.published_at) / 1000) : 0,
		url: attrs.url || (BASE_URL + "/posts/" + post.id),
		contentName: attrs.embed?.subject,
		contentThumbnails: new Thumbnails([
			new Thumbnail(attrs.thumbnail?.large || attrs.image?.thumb_url, 1)
		].filter(x => x.url)),
		lockDescription: "Exclusive for members",
		unlockUrl: attrs.url || (BASE_URL + "/posts/" + post.id),
	});
}

// Creates appropriate video descriptor based on file type
function createVideoDescriptor(postFile) {
	if (!postFile?.url) return null;
	
	if (postFile.url.includes('.m3u8')) {
		return new VideoSourceDescriptor([
			new HLSSource({
				name: "Original",
				duration: postFile.duration,
				url: postFile.url,
				requestModifier: PATREON_REQUEST_MODIFIER
			})
		]);
	} else {
		return new VideoSourceDescriptor([
			new VideoUrlSource({
				name: "Original",
				url: postFile.url,
				duration: postFile.duration,
				requestModifier: PATREON_REQUEST_MODIFIER
			})
		]);
	}
}

// Creates a Map for efficient lookup of included data
function createIncludedLookupMap(includedData) {
	const map = new Map();
	if (includedData) {
		for (const item of includedData) {
			const key = `${item.type}:${item.id}`;
			map.set(key, item);
		}
	}
	return map;
}


log("LOADED");